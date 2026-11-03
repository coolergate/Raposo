import { UTIL_GetPlayerByUser } from "./utils/player";
import { BindableSignal } from "./utils/signal";
import { EntityEnvironment } from "./entities";
import { CLifecycleContainer, LifecyclePriority } from "./lifecycle";
import { NetworkTunnel } from "./networking";
import { CSnapshotManager } from "./networking/snapshot";

// # Types
declare global {
	type T_SessionInstance = SessionInstance;
	type T_SessionControllerConstructor = new ( session: T_SessionInstance ) => I_SessionControllerClass;

	interface I_SessionControllerClass {
		Destroy(): void;
	}
}

// # Constants
const Players = game.GetService ( "Players" );
const RunService = game.GetService ( "RunService" );

// # Functions

// # Class
export class SessionInstance {
	static instances: SessionInstance[] = [];
	static instance_created = new BindableSignal<[SessionInstance]> ();

	readonly entities = new EntityEnvironment ( this );
	readonly lifecycle = new CLifecycleContainer ();
	readonly networkctx: NetworkTunnel;
	readonly snapshots:  CSnapshotManager;

	readonly on_destroy = new BindableSignal ();
	readonly player_joined = new BindableSignal<[user: Player]> ();
	readonly player_left = new BindableSignal<[user: Player, reason: string]> ();

	readonly players = new Set<ReturnType<User["ToString"]>> ();
	readonly blocked_players = new Map<number, string> ();
	should_player_join = ( user: Player ) => user.UserId !== 1;

	world_owner: Player["UserId"] | undefined;

	private current_tick = -1; // Fuckass 😭

	settings = {
		badsport_allowed: false,
	};

	constructor( readonly id: string, readonly server = RunService.IsServer () ) {
		SessionInstance.instances.push ( this );

		this.networkctx = new NetworkTunnel ( id, user => this.players.has ( user.User.ToString () ) );
		this.snapshots = new CSnapshotManager ( this ); // THIS NEEDS TO BE SET AFTER NETWORKCTX

		this.lifecycle.BindUpdate ( LifecyclePriority.Tickrate, info => this.Update ( info.frame_delta_time ) );

		if ( server )
			Players.PlayerRemoving.Connect ( ( user, exit_reason ) => {
				if ( !this.players.has ( user.User.ToString () ) )
					return;

				let reason: string | undefined;
				if ( exit_reason === Enum.PlayerExitReason.PlatformKick )
					reason = "Kicked by Roblox.";
				if ( exit_reason === Enum.PlayerExitReason.CreatorKick )
					reason = "Kicked by game.";

				this.RemovePlayer ( user.User.ToString (), reason );
			} );

		SessionInstance.instance_created.Fire ( this );

		warn ( `Session ${id} created on the ${server ? "server" : "client"}.` );
	}

	RemovePlayer( user_id: ReturnType<User["ToString"]>, reason = "Unknown reason." ) {
		if ( !this.players.has ( user_id ) )
			return;

		const instance = UTIL_GetPlayerByUser ( user_id );

		this.players.delete ( user_id );
		if ( instance )
			this.player_left.Fire ( instance, reason );
	}

	InsertPlayer( user: Player ): boolean {
		if ( this.players.has ( user.User.ToString () ) )
			return false;

		if ( this.blocked_players.has ( user.UserId ) ) {
			warn ( `Player ${user.UserId} (@${user.Name}) has been blocked from joining session ${this.id}: ${this.blocked_players.get ( user.UserId )}.` );
			return false;
		}

		this.players.add ( user.User.ToString () );
		this.player_joined.Fire ( user );

		// if (DEBUG_ENABLED)
		print ( `Player ${user.Name} (@${user.UserId}) joined the session ${this.id}.` );

		return true;
	}

	Update( dt: number ) {
		this.current_tick++;

		for ( const [ , ent ] of this.entities.entities )
			ent.Think ( dt );

		if ( this.server ) {
			this.snapshots.ServerSnapshotCycle ( this.networkctx, this.entities, this.players );
			this.snapshots.ClearOldSnapshots ();
		}
	}

	Destroy() {
		const session_list_index = SessionInstance.instances.indexOf ( this );

		if ( session_list_index !== -1 )
			SessionInstance.instances.remove ( session_list_index );

		for ( const user_id of this.players )
			this.RemovePlayer ( user_id, "Session is shutting down." );

		this.on_destroy.Fire ()
			.await ();

		for ( const [ entid, ent ] of this.entities.entities ) {
			ent.Destroy ();
			this.entities.entities.delete ( entid );
		}
	}
}
