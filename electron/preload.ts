import { contextBridge, ipcRenderer } from 'electron';

const api = {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const listener = (_event: unknown, ...cbArgs: unknown[]) => callback(...cbArgs);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  requestBackupPath: () => ipcRenderer.invoke('backup:selectDir'),
  openPath: (p: string) => ipcRenderer.invoke('fs:openPath', p),
};

contextBridge.exposeInMainWorld('ahmedAPI', api);

export type AhmedAPI = typeof api;
export interface Window {
  ahmedAPI?: AhmedAPI;
}