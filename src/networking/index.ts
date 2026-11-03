import { t } from "@rbxts/t";
import { BindableSignal } from "../utils/signal";
import { BufferReader } from "../utils/bufferdynamic";
import { UTIL_ReplicatedInstance } from "../utils/instances";

// # Interfaces & types
interface I_NetworkPostContext {
	id:         string;
	ignore?:    Player[];
	players?:   Player[];
	unreliable: boolean;
	tunnel:     NetworkTunnel;
}

// # Constants
const Players = game.GetService ( "Players" );
const RunService = game.GetService ( "RunService" );

const NETWORK_DEBUG = ( false );
const NETWORK_PORT_SEPARATOR = "::";
const BITS_PER_BYTE = 8;

const remoteEvent = UTIL_ReplicatedInstance ( workspace, "RemoteEvent", "RemoteEvent" );
const unreliableRemoteEvent = UTIL_ReplicatedInstance ( workspace, "UnreliableRemoteEvent", "UnreliableRemoteEvent" );

// # Functions
export function SendNetworkPacket( bfr_instance: buffer, context: I_NetworkPostContext ) {
	if ( !context.tunnel.is_server && RunService.IsServer () )
		throw "Attempted to send a client -> server packet from the server.";

	// Clone the buffer so that we can add the network header info
	const original_bfr_len = buffer.len ( bfr_instance );
	const original_bfr_len_in_bits = BITS_PER_BYTE * original_bfr_len;

	const header_str = `${context.tunnel.tunnel_id}${NETWORK_PORT_SEPARATOR}${context.id}`;
	const header_len = ( 16 / BITS_PER_BYTE ) + header_str.size ();
	const header_len_in_bits = BITS_PER_BYTE * header_len;

	const new_bfr_len = original_bfr_len + header_len;
	const new_bfr_len_in_bits = BITS_PER_BYTE * new_bfr_len;

	const new_buffer = buffer.create ( new_bfr_len );
	let current_bit_offset = 0;

	// print("BUFFER ORIGINAL LEN:", original_bfr_len);
	// print("BUFFER HEADER LEN:", header_len);
	// print("BUFFER NEW BUFFER LEN:", new_bfr_len);

	// Write the "header"
	{
		buffer.writebits ( new_buffer, current_bit_offset, 16, header_str.size () );
		current_bit_offset += 16;

		for ( let i = 0; i < header_str.size (); i++ ) {
			const character_byte = string.byte ( header_str, i + 1, i + 1 )[0];

			// print("Writing header character:", character_byte, string.char(character_byte));
			// print(`     Offset = ${current_bit_offset} out of ${new_bfr_len_in_bits}.`);

			buffer.writebits ( new_buffer, current_bit_offset, 8, character_byte );
			current_bit_offset += 8;
		}
	}

	// Copy all the bits over from the original
	for ( let i = header_len_in_bits; i < new_bfr_len_in_bits; i++ )
		buffer.writebits (
			new_buffer,
			i,
			1,
			buffer.readbits ( bfr_instance, i - header_len_in_bits, 1 ),
		);

	// Post the thing
	const full_context: Required<I_NetworkPostContext> = {
		players: [],
		ignore:  [],
		...context,
	};

	if ( RunService.IsStudio () && NETWORK_DEBUG ) {
		print ( "====== SENDING NETWORK PACKAGE ====================" );
		print ( "Sending network package:", header_str );
		print ( "Target:", full_context.players.filter ( user => !full_context.ignore.includes ( user ) ) );
		print ( `Original buffer size: ${original_bfr_len} bytes (${original_bfr_len_in_bits} bits)` );
		print ( `Modified buffer size: ${new_bfr_len} bytes (${new_bfr_len_in_bits} bits)` );
		print ( "===================================================" );
	}

	context.tunnel.network_posted.Fire ( new_buffer, full_context );

	if ( !context.tunnel.post_remote )
		return;

	if ( full_context.tunnel.is_server )
		for ( const user of full_context.players ) {
			if ( !user.IsDescendantOf ( Players ) )
				continue;
			if ( !full_context.tunnel.ShouldSendPlayer ( user ) )
				continue;

			if ( full_context.unreliable && buffer.len ( new_buffer ) <= 1_000 ) // TODO: Create algorithm for sending split packets
				unreliableRemoteEvent.FireClient ( user, new_buffer );
			else
				remoteEvent.FireClient ( user, new_buffer );
		}
	else
		if ( full_context.unreliable && buffer.len ( new_buffer ) <= 1_000 ) // TODO: Create algorithm for sending split packets
			unreliableRemoteEvent.FireServer ( new_buffer );
		else
			remoteEvent.FireServer ( new_buffer );
}

function ExtractHeaderInformationFromBuffer( bfr_instance: buffer ) {
	const header_characters: string[] = [];
	let current_offset = 0;

	{
		const header_len = buffer.readbits ( bfr_instance, 0, 16 );
		current_offset += 16;

		for ( let i = 0; i < header_len; i++ ) {
			const character_byte = buffer.readbits ( bfr_instance, current_offset, 8 );

			header_characters.push ( string.char ( character_byte ) );
			current_offset += 8;
		}
	}

	const string_size_in_bits = 16 + ( 8 * header_characters.size () );
	const original_bfr_len_in_bits = BITS_PER_BYTE * buffer.len ( bfr_instance );
	const reduced_bfr_len_in_bits = original_bfr_len_in_bits - string_size_in_bits;

	const new_buffer = buffer.create ( reduced_bfr_len_in_bits / BITS_PER_BYTE );

	// Copy all the bits over from the original
	for ( let i = current_offset; i < original_bfr_len_in_bits; i++ )
		buffer.writebits (
			new_buffer,
			i - string_size_in_bits,
			1,
			buffer.readbits ( bfr_instance, i, 1 ),
		);

	return [ header_characters.join ( "" ), new_buffer ] as const;
}

// Class
export class NetworkTunnel {
	post_remote = true;
	is_server = RunService.IsServer ();
	readonly network_posted = new BindableSignal<[bfr: buffer, info: Required<I_NetworkPostContext>]> ();

	private server_listeners = new Map<string, Callback> ();
	private client_listeners = new Map<string, Callback> ();

	private connections: RBXScriptConnection[] = [];

	constructor( public readonly tunnel_id: string, public readonly ShouldSendPlayer: ( user: Player ) => boolean ) {
		if ( RunService.IsClient () ) {
			remoteEvent.OnClientEvent.Connect ( data => this.Insert ( undefined, data ) );
			unreliableRemoteEvent.OnClientEvent.Connect ( data => this.Insert ( undefined, data ) );
		}
		else {
			remoteEvent.OnServerEvent.Connect ( ( sender, data ) => this.Insert ( sender, data ) );
			unreliableRemoteEvent.OnServerEvent.Connect ( ( sender, data ) => this.Insert ( sender, data ) );
		}
	}

	Destroy() {
		this.server_listeners.clear ();
		this.client_listeners.clear ();
		this.network_posted.Clear ();

		for ( const connection of this.connections )
			connection.Disconnect ();
		this.connections.clear ();
	}

	ListenServer( id: string, callback: ( user: Player, data: BufferReader ) => void | buffer ) {
		if ( this.server_listeners.has ( id ) )
			throw `Another listener already exists for id ${id}.`;

		this.server_listeners.set ( id, callback );
	}

	ListenClient( id: string, callback: ( data: BufferReader ) => void ) {
		if ( this.client_listeners.has ( id ) )
			throw `Another listener already exists for id ${id}.`;

		this.client_listeners.set ( id, callback );
	}

	Insert( sender: Player | undefined, data: unknown ) {
		if ( this.is_server && !t.instanceIsA ( "Player" ) ( sender ) )
			throw `Received server packets must include a sender. ${typeOf ( sender )} ${sender}`;

		if ( !t.buffer ( data ) )
			throw `Received data packet must be a buffer. ${typeOf ( buffer )} ${buffer}`;

		const [ package_id, fixed_buffer ] = ExtractHeaderInformationFromBuffer ( data );
		const reader = new BufferReader ( fixed_buffer );

		// Check id, to match with this current context's port
		const split_id_string = package_id.split ( NETWORK_PORT_SEPARATOR );
		const tunnel_id = split_id_string[0];
		const network_id = split_id_string[1];

		if ( tunnel_id !== this.tunnel_id )
			return;

		if ( RunService.IsStudio () && NETWORK_DEBUG ) {
			print ( "====== RECEIVED NETWORK PACKAGE ===================" );
			print ( "Package id:", package_id );
			print ( "Sender:", sender ? `${sender.Name} (@${sender.UserId})` : "Server" );
			if ( this.is_server )
				print ( "Has server listener:", this.server_listeners.has ( network_id ) );
			else
				print ( "Has client listener:", this.client_listeners.has ( network_id ) );
			print ( "Original buffer size:", buffer.len ( data ) );
			print ( "Extracted buffer size:", buffer.len ( fixed_buffer ) );
			print ( "===================================================" );
		}

		if ( this.is_server ) {
			if ( !this.server_listeners.has ( network_id ) )
				warn ( `Received unknown network id ${package_id} sent from user ${sender?.UserId} (@${sender?.Name}).` );

			this.server_listeners.get ( network_id ) ?. ( sender, reader );
		}

		if ( !this.is_server ) {
			if ( !this.client_listeners.has ( network_id ) )
				warn ( `Received unknown network id ${package_id} sent from server.` );

			this.client_listeners.get ( network_id ) ?. ( reader );
		}
	}
}

// # Bindings & misc
