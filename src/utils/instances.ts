import { t } from "@rbxts/t";

// # Constants
const RunService = game.GetService ( "RunService" );

export function UTIL_DoesInstanceExist( inst: Instance | undefined ): inst is Instance {
	return inst !== undefined && t.Instance ( inst ) && inst.IsDescendantOf ( game );
}

export function UTIL_ReplicatedInstance<K extends keyof CreatableInstances, I extends CreatableInstances[K]>(
	parent: Instance,
	name: string,
	classname: K,
): I {
	let targetInstance = parent.FindFirstChild ( name ) as I | undefined;

	if ( !targetInstance || !targetInstance.IsA ( classname ) ) {
		if ( RunService.IsClient () ) {
			targetInstance = parent.WaitForChild ( name + "_" + classname ) as I;
			return targetInstance;
		}

		targetInstance = new Instance ( classname ) as I;
		targetInstance.Name = name + "_" + classname;
		targetInstance.Parent = parent;
	}

	return targetInstance;
}

export function UTIL_GetAllAncestors( inst: Instance, filter?: ( inst: Instance ) => boolean ) {
	if ( !UTIL_DoesInstanceExist ( inst ) )
		throw `Passed instance (${inst}) does not exist within the game.`;

	const cycled_ancestors: Instance[] = [];
	let current_instance = inst.Parent;

	while ( current_instance !== undefined ) {
		if ( filter && !filter ( current_instance ) )
			break;

		cycled_ancestors.push ( current_instance );
		current_instance = current_instance.Parent;
	}

	return cycled_ancestors;
}
