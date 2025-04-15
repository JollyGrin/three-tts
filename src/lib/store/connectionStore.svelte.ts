import { writable } from 'svelte/store';

type ConnectionDTO = {
	serverUrl: string;
};

const key = 'serverurl';
const connection = writable<ConnectionDTO>({
	serverUrl: 'http://localhost:8080'
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
		const serverUrl = localStorage.getItem(key) ?? 'https://api.table.place';
		if (serverUrl) connection.set({ serverUrl });
	}
};
