const ScopeList = [
	'about',
	'avatars',
	'verified-accounts',
	'links',
	'interests',
	'contact-info',
	'wallet',
	'photos',
	'design',
	'privacy',
] as const;

export type Scope = ( typeof ScopeList )[ number ][];

export type ProfileUpdatedType = 'avatar_updated' | 'profile_updated';

export type Open = ( email?: string ) => void;

export type OnProfileUpdated = ( type: ProfileUpdatedType ) => void;

export type OnOpened = () => void;

export type QuickEditorCoreOptions = Partial< {
	email: string;
	scope: Scope;
	locale: string;
	onProfileUpdated: OnProfileUpdated;
	onOpened: OnOpened;
} >;

export class GravatarQuickEditorCore {
	_name: string;
	_email: string;
	_scope: Scope;
	_locale: string;
	_onProfileUpdated: OnProfileUpdated;
	_onOpened: OnOpened;
    _targetWindow: WindowProxy | null;

	constructor( { email, scope = [], locale, onProfileUpdated, onOpened }: QuickEditorCoreOptions ) {
		this._name = this._getName();
		this._email = email ?? "";
		this._scope = scope;
		this._locale = locale ?? "en";
		this._onProfileUpdated = onProfileUpdated ?? (() => {});
		this._onOpened = onOpened ?? (() => {});
        this._targetWindow = null;

		if ( ! this._scope.every( ( s ) => ScopeList.includes( s ) ) ) {
			// eslint-disable-next-line
			console.error(
				'Gravatar Quick Editor: Invalid scope definition. Available scope: ' + ScopeList.join( ', ' )
			);
			this._scope = this._scope.filter( ( s ) => ScopeList.includes( s ) );
		}

		window.addEventListener( 'message', this._onMessage.bind( this ) );
	}

    close() {
        if (!this._targetWindow) return;

        this._targetWindow.close();
    }

	open: Open = ( email ) => {
		email = email || this._email;

		if ( ! email ) {
			// eslint-disable-next-line
			console.error( 'Gravatar Quick Editor: Email not provided' );
			return;
		}

		email = encodeURIComponent( email );
		const scope = encodeURIComponent( this._scope.join( ',' ) );

		const width = 400;
		const height = 720;
		const left = window.screenLeft + ( window.outerWidth - width ) / 2;
		const top = window.screenTop + ( window.outerHeight - height ) / 2;
		const options = `popup,width=${ width },height=${ height },top=${ top },left=${ left }`;
		const host = this._locale ? `https://${ this._locale }.gravatar.com` : 'https://gravatar.com';
		const url = `${ host }/profile?email=${ email }&scope=${ scope }&is_quick_editor=true`;

		this._targetWindow = window.open( url, this._name, options );

        if (this._targetWindow) this._targetWindow.onclose = () => {
            this._targetWindow = null;
        }

		if ( this._onOpened ) {
			this._onOpened();
		}
	};

	_getName() {
		return `GravatarQuickEditor_${ new Date().getTime() }${ Math.floor( Math.random() * ( 9999 - 1000 ) + 1000 ) }`;
	}

	_onMessage( event: MessageEvent ) {
		if ( ! this._onProfileUpdated || ! event.origin.match( /https:\/\/([a-z\-]{2,5}\.)?gravatar.com/ ) ) {
			return;
		}

		if ( event.data?.name !== this._name ) {
			return;
		}

		this._onProfileUpdated( event.data.type );
	}
}