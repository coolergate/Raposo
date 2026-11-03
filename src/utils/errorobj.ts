export function UTIL_ErrorObject<T>( message: string ) {
	return setmetatable ( {}, {
		__index: () => {
			throw message;
		},
		__newindex: () => {
			throw message;
		},
		__call: () => {
			throw message;
		},
		__tostring: () => "ErrorObject",
	} ) as T;
}