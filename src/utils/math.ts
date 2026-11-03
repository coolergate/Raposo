export function UTIL_VectorsToCFrame( position: Vector3, rotation: Vector3 ) {
	return new CFrame ( position )
		.mul ( CFrame.Angles ( math.rad ( rotation.Y ), math.rad ( rotation.X ), math.rad ( rotation.Z ) ) );
}
export function UTIL_CFrameToVectors( cf: CFrame ) {
	const [ rY, rX, rZ ] = cf.ToOrientation ();

	return [ cf.Position, new Vector3 ( math.deg ( rX ), math.deg ( rY ), math.deg ( rZ ) ) ] as const;
}

export function UTIL_Vector3ToVector2( original: Vector3 ) {
	return new Vector2 ( original.X, original.Y );
}