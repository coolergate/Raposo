import { InitializeLifeCycle } from "./lifecycle";

// # Types
declare global {
	const workspace: Workspace;
}

// # Constants
const RunService = game.GetService ( "RunService" );
const ReplicatedStorage = game.GetService ( "ReplicatedStorage" );

const server_running_attr = "RaposoRunning";

// # Functions
export function Initialize() {
	if ( !RunService.IsRunning() )
		throw "Initialize function cannot be called outside of run mode.";

	print ( "Initializing Raposo..." );

	if ( !RunService.IsServer() )
		while ( ReplicatedStorage.GetAttribute ( server_running_attr ) !== true )
			RunService.RenderStepped.Wait ();

	InitializeLifeCycle ();
	print ( "Lifecycle initialized." );

	if ( RunService.IsServer() )
		ReplicatedStorage.SetAttribute ( server_running_attr, true );
};

// # Other exports
export * as Networking from "./networking";
export * as Snapshots from "./networking/snapshot";
export * as Entities from "./entities";
export * as Lifecycle from "./lifecycle";
export * as Sessions from "./session";
export * as Utils from "./utils/export";