// # Types

// # Constants
const BUFFER_DEBUG_ENABLED = false;

export enum BufferPrimitives {
	U4,
	U8,
	I8,
	U16,
	I16,
	U32,
	I32,
	F32,
}

// # Functions
function GetByteTypeFromNumber( value: number ): BufferPrimitives {
	if ( value % 1 !== 0 )
		return BufferPrimitives.F32;

	// These have to be in order from smallest to biggest
	if ( value >= 0 && value <= 15 )
		return BufferPrimitives.U4;
	if ( value >= 0 && value <= 255 )
		return BufferPrimitives.U8;
	if ( value >= -128 && value <= 127 )
		return BufferPrimitives.I8;
	if ( value >= 0 && value <= 65_535 )
		return BufferPrimitives.U16;
	if ( value >= -32_768 && value <= 32_767 )
		return BufferPrimitives.I16;
	if ( value >= 0 && value <= 4_294_967_295 )
		return BufferPrimitives.U32;
	if ( value >= -2_147_483_648 && value <= 2_147_483_647 )
		return BufferPrimitives.I32;

	return BufferPrimitives.F32;
}

function GetNumberRangeFromByteType( byte_type: BufferPrimitives ) {
	if ( byte_type === BufferPrimitives.U4 )
		return [ 0, 15 ];
	if ( byte_type === BufferPrimitives.U8 )
		return [ 0, 255 ];
	if ( byte_type === BufferPrimitives.I8 )
		return [ -128, 127 ];
	if ( byte_type === BufferPrimitives.U16 )
		return [ 0, 65_535 ];
	if ( byte_type === BufferPrimitives.I16 )
		return [ -32_768, 32_767 ];
	if ( byte_type === BufferPrimitives.U32 )
		return [ 0, 4_294_967_295 ];
	if ( byte_type === BufferPrimitives.I32 )
		return [ -2_147_483_648, 2_147_483_647 ];
	if ( byte_type === BufferPrimitives.F32 )
		return undefined;

	throw `Unknown byte type ${byte_type}`;
}

function GetByteTypeSizeInBits( byte_type: BufferPrimitives ) {
	let bits_size: number | undefined;
	if ( byte_type === BufferPrimitives.U32 || byte_type === BufferPrimitives.I32 || byte_type === BufferPrimitives.F32 )
		bits_size = 32;
	if ( byte_type === BufferPrimitives.U16 || byte_type === BufferPrimitives.I16 )
		bits_size = 16;
	if ( byte_type === BufferPrimitives.U8 || byte_type === BufferPrimitives.I8 )
		bits_size = 8;
	if ( byte_type === BufferPrimitives.U4 )
		bits_size = 4;

	if ( bits_size === undefined )
		throw `Unknown byte type ${BufferPrimitives[byte_type]} (${byte_type}).`;

	return bits_size;
}

// # Class
export class DynamicBufferWriter {
	private tasks: ( ( bfr: buffer ) => void )[] = [];

	private total_bits_buffer_size = 0;
	private current_offset = 0;

	WriteNumber( value: number, byte_type?: BufferPrimitives ) {
		if ( !typeIs ( value, "number" ) )
			throw `Value must be a number, got ${typeOf ( value )}.`;

		if ( byte_type !== undefined ) {
			const byte_range = GetNumberRangeFromByteType ( byte_type );

			if ( byte_range !== undefined ) {
				const [ min, max ] = byte_range;

				if ( value % 1 !== 0 || value < min || value > max )
					throw `Value is outside of range (must be between ${min} and ${max}).`;
			}
		}

		if ( byte_type === undefined )
			byte_type = GetByteTypeFromNumber ( value );

		const bits_size = GetByteTypeSizeInBits ( byte_type );

		if ( byte_type === BufferPrimitives.F32 )
			value = string.unpack ( "I4", string.pack ( "f", value ) )[0] as number;

		if ( value < 0 && byte_type !== BufferPrimitives.F32 )
			value = value + 2 ** bits_size;
		// if (byte_type === BufferByteType.I8) value = bit32.band(value, 0xFF);
		// if (byte_type === BufferByteType.I16) value = bit32.band(value, 0xFFFF);
		// if (byte_type === BufferByteType.I32) value = bit32.band(value, 0xFFFFFFFF);

		this.total_bits_buffer_size += bits_size + 4; // Use a 4 bit number to indicate the type of byte, because we're dumb.
		this.tasks.push ( bfr => {
			// print(`WRITING NUMBER ${value} [${BufferByteType[byte_type]}] | ${this.current_offset} -> ${this.current_offset + bits_size} (+${bits_size})`);

			buffer.writebits ( bfr, this.current_offset, 4, byte_type );
			this.current_offset += 4;

			buffer.writebits ( bfr, this.current_offset, bits_size, value );
			this.current_offset += bits_size;
		} );

		return this;
	}

	WriteString( value: string ) {
		if ( !typeIs ( value, "string" ) )
			throw `Value must be a string, got ${typeOf ( value )}`;

		this.total_bits_buffer_size += 16 + ( value.size () * 8 ); // 8 because each character = 1 byte, byte = 8 bits
		this.tasks.push ( bfr => {
			buffer.writebits ( bfr, this.current_offset, 16, value.size () );
			this.current_offset += 16;

			for ( let i = 0; i < value.size (); i++ ) {
				const character_byte = string.byte ( value, i + 1 )[0];

				buffer.writebits ( bfr, this.current_offset, 8, character_byte );
				this.current_offset += 8;
			}
		} );

		return this;
	}

	WriteBoolean( value: boolean ) {
		if ( !typeIs ( value, "boolean" ) )
			throw `Value must be a boolean, got ${typeOf ( value )}`;

		this.total_bits_buffer_size++;
		this.tasks.push ( bfr => {
			buffer.writebits ( bfr, this.current_offset, 1, value ? 1 : 0 );
			this.current_offset++;
		} );

		return this;
	}

	WriteVector( value: Vector3 ) {
		this.WriteNumber ( value.X );
		this.WriteNumber ( value.Y );
		this.WriteNumber ( value.Z );

		return this;
	}

	GenerateBuffer() {
		const buffer_instance = buffer.create ( math.max ( math.ceil ( this.total_bits_buffer_size / 8 ), 1 ) );

		if ( BUFFER_DEBUG_ENABLED ) {
			warn ( "Buffer generation start." );
			warn ( `    ${buffer.len ( buffer_instance )} (${this.total_bits_buffer_size} bits)` );
			warn ( `    Starting offset: ${this.current_offset}` );
		}

		for ( const task of this.tasks ) {
			task ( buffer_instance );

			if ( BUFFER_DEBUG_ENABLED )
				warn ( `    Task iterated, current offset: ${this.current_offset}` );
		}

		this.tasks.clear ();

		return buffer_instance;
	}
}

export class BufferReader {
	private current_offset = 0;

	constructor( private bfr_instance: buffer ) { }

	ReadNumber(): number {
		const byte_type = buffer.readbits ( this.bfr_instance, this.current_offset, 4 );
		this.current_offset += 4;

		const bits_size = GetByteTypeSizeInBits ( byte_type );

		let value = buffer.readbits ( this.bfr_instance, this.current_offset, bits_size );
		this.current_offset += bits_size;

		if ( byte_type === BufferPrimitives.F32 )
			value = string.unpack ( "f", string.pack ( "I4", value ) )[0] as number;

		const is_signed
			= byte_type === BufferPrimitives.I8
				|| byte_type === BufferPrimitives.I16
				|| byte_type === BufferPrimitives.I32;

		if ( is_signed && value >= 2 ** ( bits_size - 1 ) )
			value -= 2 ** bits_size;
		// if (byte_type === BufferByteType.I8 && value >= 128) value -= 2 ^ 8;
		// if (byte_type === BufferByteType.I16 && value >= 32_768) value -= 2 ^ 16;
		// if (byte_type === BufferByteType.I32 && value >= 2_147_483_648) value -= 2 ^ 32;

		return value;
	}

	ReadString() {
		const characters: string[] = [];
		const length = buffer.readbits ( this.bfr_instance, this.current_offset, 16 );

		this.current_offset += 16;

		for ( let i = 0; i < length; i++ ) {
			const character_byte = buffer.readbits ( this.bfr_instance, this.current_offset, 8 );

			characters.push ( string.char ( character_byte ) );
			this.current_offset += 8;
		}

		return characters.join ( "" );
	}

	ReadVector() {
		const x = this.ReadNumber ();
		const y = this.ReadNumber ();
		const z = this.ReadNumber ();

		return new Vector3 ( x, y, z );
	}

	ReadBoolean() {
		const value = buffer.readbits ( this.bfr_instance, this.current_offset, 1 );
		this.current_offset++;

		return value === 1;
	}
}
