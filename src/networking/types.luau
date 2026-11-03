-- # Constants
const utils = require("../utils/types")

-- # Exports
export type NetworkPostContext = {
	id: string,
	ignore: { Player }?,
	players: { Player }?,
	unreliable: boolean,
	tunnel: NetworkTunnelClass,
}

export type NetworkTunnelClass = {
	post_remote: boolean,
	is_server: boolean,

	tunnel_id: string,
	ShouldSendPlayer: (user: Player) -> boolean,

	Destroy: (self: NetworkTunnelClass) -> (),

	ListenServer: (
		self: NetworkTunnelClass,
		id: string,
		callback: (user: Player, data: utils.BufferReader) -> ()
	) -> (),
	ListenClient: (self: NetworkTunnelClass, id: string, callback: (data: utils.BufferReader) -> ()) -> (),

	Insert: (self: NetworkTunnelClass, sender: Player?, data: any) -> (),
}

export type NetworkModule = {
	SendNetworkPacket: (bfr_instance: buffer, context: NetworkPostContext) -> (),
}

return nil
