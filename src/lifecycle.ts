import { BindableSignal } from "./utils/signal";

// # Types
type T_DeltaTimeCallback = ( info: I_LifecycleBindInfo ) => void;

interface I_LifecycleBindInfo {
	tickrate:         number;
	tickrate_alpha:   number;
	frame_delta_time: number;
	speed_multiplier: number;
	running:          boolean;
}

// # Constants & variables
const RunService = game.GetService ( "RunService" );

const GAME_STEPPED_SIGNAL = new BindableSignal<[ priority: LifecyclePriority, info: I_LifecycleBindInfo ]> ();
export const GAME_TICKRATE = 1 / 33;

export enum LifecyclePriority {
	EarlyFramerate,
	Framerate,

	EarlyTickrate,
	Tickrate,
	LateTickrate,

	LateFramerate,
}

// # Functions
export function InitializeLifeCycle() {
	let next_tickrate_update_time = time () + GAME_TICKRATE;
	let last_tickrate_update_time = time ();

	task.spawn ( () => {
		while ( game ) {
			const delta_time = task.wait (); // This may sound retarded, but this actually gives the delta time number
			const current_time = time ();

			const clamped_tickrate_alpha = math.clamp ( ( current_time - last_tickrate_update_time ) / GAME_TICKRATE, 0, 1 );
			const info: Readonly<I_LifecycleBindInfo> = {
				tickrate:         GAME_TICKRATE,
				tickrate_alpha:   clamped_tickrate_alpha,
				frame_delta_time: delta_time,
				speed_multiplier: 1, // TODO: Support this
				running:          true, // TODO: Support this
			} as const;

			table.freeze ( info );

			GAME_STEPPED_SIGNAL.Fire ( LifecyclePriority.EarlyFramerate, info ).await ();
			GAME_STEPPED_SIGNAL.Fire ( LifecyclePriority.Framerate, info ).await ();

			let total_tickrate_updates_amount = 0;

			while ( current_time > next_tickrate_update_time ) { // In case of lags, this should catch up by itself
				last_tickrate_update_time = next_tickrate_update_time;
				next_tickrate_update_time += GAME_TICKRATE;
				total_tickrate_updates_amount++;

				GAME_STEPPED_SIGNAL.Fire ( LifecyclePriority.EarlyTickrate, info ).await ();
				GAME_STEPPED_SIGNAL.Fire ( LifecyclePriority.Tickrate, info ).await ();
				GAME_STEPPED_SIGNAL.Fire ( LifecyclePriority.LateTickrate, info ).await ();
			}

			GAME_STEPPED_SIGNAL.Fire ( LifecyclePriority.LateFramerate, info ).await ();

			if ( total_tickrate_updates_amount > 1 && RunService.IsStudio () )
				warn ( `Tickrate update has been fired ${total_tickrate_updates_amount} times more for in current cycle.` );
		}
	} );
}

export function BindLifecycleUpdate( priority: LifecyclePriority, callback: T_DeltaTimeCallback ) {
	return GAME_STEPPED_SIGNAL.Connect ( ( update_priority, info ) => {
		if ( update_priority !== priority )
			return;

		callback ( info );
	} );
}

// # Classes
export class CLifecycleContainer {
	private bound_connections = new Set<BindableSignalConnection> ();

	BindUpdate( priority: LifecyclePriority, callback: T_DeltaTimeCallback ) {
		const connection = BindLifecycleUpdate ( priority, callback );

		this.bound_connections.add ( connection );

		return () => {
			connection.Disconnect ();
			this.bound_connections.delete ( connection );
		};
	}

	Destroy() {
		for ( const connection of this.bound_connections )
			connection.Disconnect ();
		this.bound_connections.clear ();
	}
}
