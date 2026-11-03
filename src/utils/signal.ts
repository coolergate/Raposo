// # Types
declare global {
	interface BindableSignalConnection {
		Disconnect(): void;
	}
}

interface ConnectionInfo<T extends unknown[]> {
	callback:       ( ...args: T ) => void;
	autoDisconnect: boolean;
}

// # Constants
const HttpService = game.GetService ( "HttpService" );

// # Class
export class BindableSignal<A extends unknown[]> {
	private connections = new Map<string, ConnectionInfo<A>> ();
	private waitingThreads = new Array<Callback> ();

	Once( callback: ( ...args: A ) => void ): BindableSignalConnection {
		const id = HttpService.GenerateGUID ();
		const connected_events = this.connections;

		connected_events.set ( id, { callback: callback, autoDisconnect: true } );

		return {
			Disconnect() {
				connected_events.delete ( id );
			},
		};
	}

	Connect( callback: ( ...args: A ) => void ): BindableSignalConnection {
		const id = HttpService.GenerateGUID ();
		const connected_events = this.connections;

		connected_events.set ( id, { callback: callback, autoDisconnect: false } );

		return {
			Disconnect() {
				connected_events.delete ( id );
			},
		};
	}

	async Fire( ...headers: A ) {
		for ( const callback of this.waitingThreads )
			callback ( ...headers );

		if ( this.HasConnections () )
			for ( const [ id, info ] of this.connections ) {
				task.spawn ( () => info.callback ( ...headers ) );

				if ( info.autoDisconnect )
					this.connections.delete ( id );
			}
	}

	Wait() {
		const thread = coroutine.running ();

		this.waitingThreads.push ( ( ...args: A ) => {
			coroutine.resume ( thread, ...args );
		} );

		return coroutine.yield ( thread ) as unknown as A;
	}

	Clear() {
		this.connections.clear ();
	}

	HasConnections() {
		return !this.connections.isEmpty ();
	}
}
