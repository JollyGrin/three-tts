import { writable } from 'svelte/store';

type ConnectionDTO = {
	serverUrl: string;
};

const key = 'serverurl';
const connection = writable<ConnectionDTO>({
	serverUrl: localStorage.getItem(key) ?? ''
});

connection.subscribe((value) => {
	localStorage.setItem(key, value.serverUrl);
});

export const connectionStore = {
	...connection,
	setServerUrl: (url: string) => {
		connection.set({ serverUrl: url });
	},
	initStore: () => {
		const serverUrl = localStorage.getItem(key);
		if (serverUrl) connection.set({ serverUrl });
	}
};
