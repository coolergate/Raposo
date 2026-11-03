const Players = game.GetService ( "Players" );

export function UTIL_GetPlayerByUser( user_id: ReturnType<User["ToString"]> ) {
	return Players.GetPlayers ()
		.find ( user => user.User.ToString () === user_id );
}

export function UTIL_GetUserStringFromPlayer( player: Player ) {
	return player.User.ToString();
}