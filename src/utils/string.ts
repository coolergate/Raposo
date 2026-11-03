export function UTIL_RandomString( length: number ) {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
	let finalString = "";

	for ( let index = 0; index < length; index++ ) {
		const randomInt = math.random ( 1, charset.size () );
		finalString = `${finalString}${charset.sub ( randomInt, randomInt )}`;
	}

	return finalString;
}

export function UTIL_RemoveStringWhitespaces( input: string ) {
	input = input.gsub ( "^%s+", "" )[0];
	input = input.gsub ( "%s+$", "" )[0];

	return input;
}
