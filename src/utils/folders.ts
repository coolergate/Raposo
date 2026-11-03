import { UTIL_ReplicatedInstance } from "./instances";

const ReplicatedStorage = game.GetService ( "ReplicatedStorage" );

const map_root = UTIL_ReplicatedInstance ( workspace, "Map", "Folder" );
const game_root = UTIL_ReplicatedInstance ( workspace, "GameContent", "Configuration" );

export const map_folders = {
	root:    map_root,
	parts:   UTIL_ReplicatedInstance ( map_root, "Parts", "Folder" ),
	objects: UTIL_ReplicatedInstance ( map_root, "Objects", "Folder" ),
};

export const storage_folders = {
	animations: UTIL_ReplicatedInstance ( ReplicatedStorage, "Animations", "Folder" ),
	models:     UTIL_ReplicatedInstance ( ReplicatedStorage, "Models", "Folder" ),
	interface:  UTIL_ReplicatedInstance ( ReplicatedStorage, "Interface", "Folder" ),
};

export const game_folders = {
	root:    game_root,
	sounds:  UTIL_ReplicatedInstance ( game_root, "Sounds", "Configuration" ),
	objects: UTIL_ReplicatedInstance ( game_root, "Objects", "Configuration" ),
};
