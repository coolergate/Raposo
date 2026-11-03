import { UTIL_RandomString } from "./utils/string";
import { BindableSignal } from "./utils/signal";
import { UTIL_ErrorObject } from "./utils/errorobj";
import { t } from "@rbxts/t";
import { UTIL_DoesInstanceExist } from "./utils/instances";

// # Types
declare global {
	type T_EntityEnvironment = EntityEnvironment;
	type T_EntityId = string;
	type T_EntityClassname = keyof I_GameEntities;

	interface I_GameEntities {
		Entity: BaseEntityClass;
	}

	interface I_GameEntityConstructors {
		Entity: [];
	}
}

type T_ValidGameEntities<T, U> = Pick<T, Extract<keyof T, keyof U>>;
type T_EntityClassConstructorArguments<T extends keyof I_GameEntityConstructors> = I_GameEntityConstructors[T];
type T_EntityClassConstructor = ( session: T_SessionInstance, ...args: unknown[] ) => BaseEntityClass;

// # Constants & variables
const RunService = game.GetService ( "RunService" );

const ENTITIES_DEBUG_LOGGING = false;
const ENTITIES_CLASS_CONSTRUCTORS = new Map<T_EntityClassname, T_EntityClassConstructor> ();

// # Functions
export function RegisterEntityClassConstructor<T extends keyof I_GameEntityConstructors>( name: T, callback: ( session: T_SessionInstance, ...args: T_EntityClassConstructorArguments<T> ) => BaseEntityClass ) {
	if ( ENTITIES_DEBUG_LOGGING )
		print ( "Registered entity constructor", name );

	ENTITIES_CLASS_CONSTRUCTORS.set ( name, callback as T_EntityClassConstructor );
}

// # Class
export class EntityEnvironment {
	readonly entities = new Map<T_EntityId, BaseEntityClass> ();
	readonly local_entities = new Set<T_EntityId> ();

	readonly entities_constructor_arguments = new Map<T_EntityId, unknown[]> ();

	readonly entity_added = new BindableSignal<[BaseEntityClass]> ();
	readonly entity_removing = new BindableSignal<[BaseEntityClass]> ();

	constructor( private session: T_SessionInstance ) { }

	CreateEntity<C extends keyof T_ValidGameEntities<I_GameEntities, I_GameEntityConstructors>, E extends I_GameEntityConstructors[C]>( classname: C, id: T_EntityId | undefined, ...args: E )  {
		if ( id === undefined ) {
			id = UTIL_RandomString ( 5 );

			while ( this.entities.has ( id ) )
				id = UTIL_RandomString ( 5 );
		}

		if ( id === "" )
			throw "Empty string IDs are not allowed.";

		if ( this.entities.has ( id ) )
			throw `Entity id ${id} already exists in memory (${this.entities.get ( id )?.classname})`;

		const handler = ENTITIES_CLASS_CONSTRUCTORS.get ( classname );
		if ( !handler )
			throw `Unable to locate the handler for entity ${classname}.`;

		if ( ENTITIES_DEBUG_LOGGING )
			print ( `Creating entity ${classname} with id ${id} on the ${this.session.server ? "server" : "client"}.` );

		const entity = handler ( this.session, ...args );
		rawset ( entity, "id", id );
		rawset ( entity, "session", this.session );

		if ( !this.session.server )
			this.local_entities.add ( id );
		this.entities.set ( id, entity );

		for ( const callback of entity.setup_finished_callbacks )
			task.spawn ( callback );
		entity.setup_finished_callbacks.clear ();

		this.entities_constructor_arguments.set ( id, args as unknown[] );
		this.entity_added.Fire ( entity );

		return entity as I_GameEntities[C];
	}

	async KillEntity( entity_id: T_EntityId ) {
		const target_entity = this.entities.get ( entity_id );
		if ( !target_entity )
			return;

		this.entity_removing.Fire ( target_entity )
			.expect ();

		target_entity.Destroy ();

		this.entities_constructor_arguments.delete ( entity_id );
		this.entities.delete ( entity_id );
		this.local_entities.delete ( entity_id );
	}

	GetEntityByName( name: string ) {
		for ( const [ , ent ] of this.entities ) {
			if ( ent.name !== name )
				continue;
			return ent;
		}
	}

	GetEntitiesThatIsA<C extends T_EntityClassname, E extends I_GameEntities[C]>( classname: C ) {
		const found_entities: E[] = [];

		for ( const [ , ent ] of this.entities ) {
			if ( !ent.IsA ( classname ) )
				continue;
			found_entities.push ( ent as E );
		}

		return found_entities;
	}

	GetEntitiesOfClassname<C extends T_EntityClassname, E extends I_GameEntities[C]>( classname: C ) {
		const found_entities: E[] = [];

		for ( const [ , ent ] of this.entities )
			if ( ent.classname === classname )
				found_entities.push ( ent as E );

		return found_entities;
	}

	GetEntitiesFromInstance( inst: Instance ) {
		const found_entities: BaseEntityClass[] = [];

		for ( const [ , ent ] of this.entities )
			if ( ent.GetAssociatedInstances ().has ( inst ) )
				found_entities.push ( ent );

		return found_entities;
	}
}

export abstract class BaseEntityClass {
	readonly id = UTIL_ErrorObject<string> ( "Entity ID is not available during construction." );
	abstract readonly classname: T_EntityClassname;
	name = "Unnamed";

	protected readonly inheritance_list = new Set<T_EntityClassname> ();
	protected readonly associated_instances_set = new Set<Instance> ();
	readonly setup_finished_callbacks: Callback[] = [];
	readonly destroy_bound_callbacks:  Callback[] = [];

	constructor( public readonly session: T_SessionInstance ) {
		this.RegisterNetworkableProperty ( "name" );

		this.OnSetupFinished ( () => {
			table.freeze ( this.networkable_properties );
		} );
	}

	IsA<T extends T_EntityClassname>( classname: T ): this is I_GameEntities[T] {
		return this.inheritance_list.has ( classname );
	}

	protected OnSetupFinished( callback: Callback ) {
		this.setup_finished_callbacks.push ( callback );
	}

	// Inputs & Outputs
	readonly output_posted = new BindableSignal<[name: string, ...args: string[]]> ();
	private registered_inputs = new Map<string, Callback> ();

	protected RegisterInput( name: string, callback: ( ...args: string[] ) => void ) {
		this.registered_inputs.set ( name, callback );
	}

	FireInput( name: string, ...args: string[] ) {
		if ( !this.DoesInputExist ( name ) )
			throw `Entity input ${name} does not exist.`;

		this.registered_inputs.get ( name ) ?. ( ...args );
	}

	DoesInputExist( name: string ) {
		return this.registered_inputs.has ( name );
	}

	// Networkable properties
	readonly networkable_properties: { name: string; custom_handler: Callback; persistent: boolean }[] = [];

	protected RegisterNetworkableProperty<N extends keyof this>( name: N, custom_handler?: ( val: this[N] ) => void, persistent = false ) {
		if ( !custom_handler )
			custom_handler = ( val: unknown ) => this[name] = val as never;

		if ( !t.union ( t.number, t.string, t.boolean, t.Vector3 ) ( this[name] ) )
			throw `${tostring ( name )} cannot be replicated (value is not a number, string, boolean or Vector3).`;

		// Check to see if it already has been registered, because we REALLY do not want repeated shit
		const existing_entry = this.networkable_properties.find ( prop => prop.name === name );

		if ( existing_entry ) {
			existing_entry.custom_handler = custom_handler;
			existing_entry.persistent = persistent;
		}

		if ( existing_entry && RunService.IsStudio () )
			warn ( `Networkable property ${name as string} has already been registered, overwriting...` );

		if ( !existing_entry )
			this.networkable_properties.push ( { name: name as string, custom_handler, persistent } );
	}

	AssociateInstance( inst: Instance ) {
		if ( !UTIL_DoesInstanceExist ( inst ) )
			return;

		this.associated_instances_set.add ( inst );

		inst.Destroying.Once ( () => this.associated_instances_set.delete ( inst ) );
	}

	GetAssociatedInstances() {
		return this.associated_instances_set;
	}

	abstract Think( dt: number ): void;

	BindOnDestroy( callback: Callback ) {
		this.destroy_bound_callbacks.push ( callback );
	}

	Destroy() {
		for ( const callback of this.destroy_bound_callbacks )
			task.spawn ( callback );
		this.destroy_bound_callbacks.clear ();

		this.setup_finished_callbacks.clear ();
		this.inheritance_list.clear ();
		this.associated_instances_set.clear ();

		this.output_posted.Clear ();
		this.registered_inputs.clear ();

		rawset ( this, "environment", undefined );
		rawset ( this, "classname", undefined );
		rawset ( this, "id", undefined );

		setmetatable ( this, undefined );
		table.clear ( this );
	}
}
