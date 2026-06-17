/** Shared type definitions for the Akal Systems Lab frontend */

export interface ContainerData {
  id: string;
  name: string;
  state: string;
  status: string;
  type?: 'ubuntu' | 'postgres' | 'mysql';
  port?: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
}

export interface TerminalInfo {
  id: string;
  name: string;
}

/** API base URL for the backend */
export const API_BASE = 'http://localhost:5000';
