-- # Signal
export type BindableSignalConnection = {
	Disconnect: () -> (),
}

export type BindableSignal<A...> = {
	Once: (self: BindableSignal<A...>, callback: (A...) -> ()) -> BindableSignalConnection,
	Connect: (self: BindableSignal<A...>, callback: (A...) -> ()) -> BindableSignalConnection,
	Fire: (self: BindableSignal<A...>, A...) -> (),
	Wait: (self: BindableSignal<A...>) -> A...,
	Clear: (self: BindableSignal<A...>) -> (),
	HasConnections: (self: BindableSignal<A...>) -> boolean,
}

export type BindableSignalConstructor = {
	new: <T>() -> BindableSignal<T>,
}

-- # Buffers
export type BufferPrimitives = {
	U4: number,
	U8: number,
	I8: number,
	U16: number,
	I16: number,
	U32: number,
	I32: number,
	F32: number,
}

export type DynamicBufferWriterConstructor = {
	new: () -> DynamicBufferWriter,
}

export type DynamicBufferWriter = {
	WriteNumber: (self: DynamicBufferWriter, value: number, byte_type: number?) -> DynamicBufferWriter,
	WriteString: (self: DynamicBufferWriter, value: string) -> DynamicBufferWriter,
	WriteBoolean: (self: DynamicBufferWriter, value: boolean) -> DynamicBufferWriter,
	WriteVector: (self: DynamicBufferWriter, value: Vector3) -> DynamicBufferWriter,
	GenerateBuffer: (self: DynamicBufferWriter) -> buffer,
}

export type BufferReaderConstructor = {
	new: (bfr_instance: buffer) -> BufferReader,
}

export type BufferReader = {
	ReadNumber: (self: BufferReader) -> number,
	ReadString: (self: BufferReader) -> string,
	ReadVector: (self: BufferReader) -> Vector3,
	ReadBoolean: (self: BufferReader) -> boolean,
}

return nil
