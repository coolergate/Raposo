import { t } from "@rbxts/t";
import { NetworkTunnel, SendNetworkPacket } from ".";
import { BaseEntityClass } from "../entities";
import { LifecyclePriority } from "../lifecycle";
import { BufferReader, DynamicBufferWriter } from "../utils/bufferdynamic";
import { UTIL_GetPlayerByUser } from "../utils/player";

// # Types
declare global {
	type T_NetworkableTypes = string | number | boolean | Vector3;
}

interface I_Snapshot {
	id:        number;
	timestamp: number;

	entities:             Map<T_EntityId, T_EntityNetworkableProperty[]>;
	acknowledged_players: Set<ReturnType<User["ToString"]>>;
}

interface T_EntityNetworkableProperty { name: string; value: unknown; persistent: boolean }

// # Constants
const NETWORK_SNAPSHOT_UPDATE_ID = "SNAPSHOT_UPD";
const NETWORK_SNAPSHOT_ACKNOWLEDGE_ID = "SNAPSHOT_ACK";

const SNAPSHOT_MEM_LIFETIME = 10; // This has an impact with how the game accounts for lag compensation
const SNAPSHOT_UNREL = true;

// # Functions
function WriteBufferPropertyArgument( writer: DynamicBufferWriter, value: unknown ) {
	writer.WriteBoolean ( t.number ( value ) ); // is_number
	writer.WriteBoolean ( t.string ( value ) ); // is_string
	writer.WriteBoolean ( t.boolean ( value ) ); // is_boolean
	writer.WriteBoolean ( t.Vector3 ( value ) ); // is_vector

	if ( t.number ( value ) )
		writer.WriteNumber ( value );
	if ( t.string ( value ) )
		writer.WriteString ( value );
	if ( t.boolean ( value ) )
		writer.WriteBoolean ( value );
	if ( t.Vector3 ( value ) )
		writer.WriteVector ( value );
}

function ReadBufferPropertyArgument( reader: BufferReader ) {
	const is_number = reader.ReadBoolean ();
	const is_string = reader.ReadBoolean ();
	const is_boolean = reader.ReadBoolean ();
	const is_vector = reader.ReadBoolean ();

	let value: unknown;

	if ( is_number )
		value = reader.ReadNumber ();
	if ( is_string )
		value = reader.ReadString ();
	if ( is_boolean )
		value = reader.ReadBoolean ();
	if ( is_vector )
		value = reader.ReadVector ();

	return value;
}

function WriteBufferEntityFullState( entity: BaseEntityClass, writer: DynamicBufferWriter ) {
	const constructor_args = entity.session.entities.entities_constructor_arguments.get ( entity.id );

	if ( !constructor_args )
		writer.WriteNumber ( 0 );

	if ( constructor_args ) {
		writer.WriteNumber ( constructor_args.size () );
		for ( let i = 0; i < constructor_args.size (); i++ )
			WriteBufferPropertyArgument ( writer, constructor_args[i] );
	}

	writer.WriteNumber ( entity.networkable_properties.size () );
	for ( let i = 0; i < entity.networkable_properties.size (); i++ ) {
		const property = entity.networkable_properties[i];
		const property_value = entity[property.name as keyof typeof entity] as unknown;

		writer.WriteBoolean ( true ); // To fakely indicate that it has "changed"
		WriteBufferPropertyArgument ( writer, property_value );
	}
}

function WriteBufferEntityDeltaState( previous_state: T_EntityNetworkableProperty[], next_state: T_EntityNetworkableProperty[], writer: DynamicBufferWriter ) {
	if ( previous_state.size () !== next_state.size () )
		throw `Entity networkable properties list are not the same size (${previous_state.size ()} and ${next_state.size ()}).`;

	writer.WriteNumber ( 0 ); // Skip the constructor args part

	writer.WriteNumber ( math.max ( previous_state.size (), next_state.size () ) );
	for ( let i = 0; i < math.max ( previous_state.size (), next_state.size () ); i++ ) {
		const next_property = next_state[i];
		const prev_property = previous_state[i];

		if ( !prev_property )
			throw `Missing previous networkable state property index ${i}.`;
		if ( !next_property )
			throw `Missing next networkable state property index ${i}.`;

		if ( typeOf ( prev_property.value ) !== typeOf ( next_property.value ) )
			throw `Attempt to compare state properties from different types at offset ${i} -> ${prev_property.name} (${typeOf ( prev_property.value )} against ${typeOf ( next_property.value )}).`;

		if ( prev_property.value === next_property.value && !t.boolean ( next_property.value ) && !next_property.persistent ) {
			writer.WriteBoolean ( false );
			continue;
		}

		writer.WriteBoolean ( true );
		WriteBufferPropertyArgument ( writer, next_property.value );
	}
}

function BindClientSnapshotReceival( session: T_SessionInstance ) {
	const building_entities = new Set<T_EntityId> ();
	const updates_to_process: BufferReader[] = [];

	session.lifecycle.BindUpdate ( LifecyclePriority.EarlyFramerate, () => {
		if ( updates_to_process.size () <= 0 )
			return;

		while ( updates_to_process.size () > 0 ) {
			const reader = updates_to_process.shift ();
			if ( !reader )
				continue;

			const snapshot_id = reader.ReadNumber ();
			const server_entities_ids = new Set<T_EntityId> ();

			// Get all entities from the server
			const entities_amount = reader.ReadNumber ();
			for ( let i = 0; i < entities_amount; i++ ) {
				const entity_id = reader.ReadString () as T_EntityId;
				const entity_classname = reader.ReadString () as keyof I_GameEntityConstructors;
				const constructor_args: T_NetworkableTypes[] = [];

				server_entities_ids.add ( entity_id );

				const constructors_arg_size = reader.ReadNumber ();
				for ( let i = 0; i < constructors_arg_size; i++ )
					constructor_args.push ( ReadBufferPropertyArgument ( reader ) as T_NetworkableTypes );

				// Before continuing, we need to check if the entity exisits in our client
				while ( building_entities.has ( entity_id ) )
					task.wait ();

				if ( !session.entities.entities.has ( entity_id ) ) {
					building_entities.add ( entity_id );

					session.entities.CreateEntity (
						entity_classname,
						entity_id,
						...constructor_args as I_GameEntityConstructors[typeof entity_classname],
					);

					session.entities.local_entities.delete ( entity_id );
					building_entities.delete ( entity_id );
				}

				const entity = session.entities.entities.get ( entity_id );
				if ( !entity )
					throw `Replication error: Local session does not contain entity ${entity_classname} of id ${entity_id}.`;

				// Iterate through the changed properties
				const changed_properties_amount = reader.ReadNumber ();
				for ( let i = 0; i < changed_properties_amount; i++ ) {
					const has_changed = reader.ReadBoolean ();
					if ( !has_changed )
						continue;

					const target_property = entity.networkable_properties[i];
					const value = ReadBufferPropertyArgument ( reader );

					target_property.custom_handler ( value );
				}
			}

			// Remove non-present entities
			for ( const [ ent_id ] of session.entities.entities ) {
				if ( building_entities.has ( ent_id ) )
					continue;
				if ( server_entities_ids.has ( ent_id ) || session.entities.local_entities.has ( ent_id ) )
					continue;
				session.entities.KillEntity ( ent_id );
			}

			// Acknowledge the snapshot
			SendNetworkPacket (
				new DynamicBufferWriter ()
					.WriteNumber ( snapshot_id )
					.GenerateBuffer (),
				{ id: NETWORK_SNAPSHOT_ACKNOWLEDGE_ID, tunnel: session.networkctx, unreliable: SNAPSHOT_UNREL },
			);
		}
	} );

	session.networkctx.ListenClient ( NETWORK_SNAPSHOT_UPDATE_ID, reader => updates_to_process.push ( reader ) );
}

// # Class
export class CSnapshotManager {
	current_snapshot_id = 0;
	readonly snapshot_list: I_Snapshot[] = [];

	constructor( session: T_SessionInstance ) {
		if ( session.server )
			session.networkctx.ListenServer ( NETWORK_SNAPSHOT_ACKNOWLEDGE_ID, ( user, reader ) => {
				const snapshot_id = reader.ReadNumber ();
				const target_snapshot = this.GetSnapshotFromId ( snapshot_id );

				if ( !target_snapshot )
					warn ( "Player", user.UserId, `has tried to acknowledge unknown snapshot id "${snapshot_id}".` );

				target_snapshot?.acknowledged_players.add ( user.User.ToString () );
			} );

		if ( !session.server )
			BindClientSnapshotReceival ( session );
	}

	ServerSnapshotCycle( network_tunnel: NetworkTunnel, ent_environment: T_EntityEnvironment, players: Set<ReturnType<User["ToString"]>> ) {
		const current_snapshot = this.CaptureSnapshot ( ent_environment );

		// Build a new delta snapshot for each player
		for ( const user_id of players ) {
			const user_instance = UTIL_GetPlayerByUser ( user_id );
			if ( !user_instance )
				continue;

			const last_acknowledged_snapshot = this.GetLastPlayerAcknowledgedSnapshot ( user_id );
			let packet_unreliable = true;

			// Write buffer values
			const writer = new DynamicBufferWriter ();
			writer.WriteNumber ( current_snapshot.id );

			writer.WriteNumber ( current_snapshot.entities.size () );
			for ( const [ entity_id, current_state ] of current_snapshot.entities ) {
				const entity = ent_environment.entities.get ( entity_id );
				if ( !entity )
					throw "What the fuck? How do we not have an entity if the current snapshot mentions it???";

				writer.WriteString ( entity_id );
				writer.WriteString ( entity.classname );

				const previous_state = last_acknowledged_snapshot?.entities.get ( entity_id );

				if ( previous_state )
					WriteBufferEntityDeltaState ( previous_state, current_state, writer );
				else
					WriteBufferEntityFullState ( entity, writer );

				if ( !previous_state )
					packet_unreliable = false;
			}

			SendNetworkPacket (
				writer.GenerateBuffer (),
				{ id: NETWORK_SNAPSHOT_UPDATE_ID, tunnel: network_tunnel, players: [ user_instance ], unreliable: SNAPSHOT_UNREL && packet_unreliable },
			);
		}
	}

	GetLastPlayerAcknowledgedSnapshot( user: ReturnType<User["ToString"]> ) {
		let last_snapshot: I_Snapshot | undefined;

		for ( let i = 0; i < this.snapshot_list.size (); i++ ) {
			const snapshot = this.snapshot_list[i];
			if ( !snapshot.acknowledged_players.has ( user ) )
				continue;

			if ( !last_snapshot )
				last_snapshot = snapshot;

			if ( last_snapshot.timestamp > snapshot.timestamp )
				continue;

			last_snapshot = snapshot;
		}

		return last_snapshot;
	}

	CaptureSnapshot( entity: T_EntityEnvironment ) {
		const obj: I_Snapshot = {
			id:                   this.current_snapshot_id,
			timestamp:            time (),
			entities:             new Map (),
			acknowledged_players: new Set (),
		};

		for ( const [ , ent ] of entity.entities ) {
			const properties_list: T_EntityNetworkableProperty[] = [];

			for ( let i = 0; i < ent.networkable_properties.size (); i++ ) {
				const property = ent.networkable_properties[i];
				properties_list[i] = { name: property.name, value: ent[property.name as keyof typeof ent] as unknown, persistent: property.persistent };
			}

			obj.entities.set ( ent.id, properties_list );
		}

		this.snapshot_list.insert ( 0, obj );
		this.snapshot_list.sort ( ( a, b ) => a.timestamp > b.timestamp );
		this.current_snapshot_id++;
		return obj;
	}

	GetSnapshotFromId( id: I_Snapshot["id"] ) {
		for ( const snapshot of this.snapshot_list )
			if ( snapshot.id === id )
				return snapshot;
	}

	ClearOldSnapshots() {
		const current_time = time ();

		for ( let i = 0; i < this.snapshot_list.size (); i++ ) {
			const snapshot = this.snapshot_list[i];
			if ( current_time - snapshot.timestamp < SNAPSHOT_MEM_LIFETIME )
				continue;

			this.snapshot_list.remove ( i );
			i--;
		}
	}
}
