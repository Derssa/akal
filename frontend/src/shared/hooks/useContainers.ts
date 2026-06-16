import { useState, useCallback } from 'react';
import { API_BASE } from '../types';
import type { ContainerData } from '../types';

interface UseContainersOptions {
  projectId: string;
  onToast?: (message: string) => void;
}

/**
 * Custom hook that encapsulates all container CRUD operations
 * against the backend API, scoped to a specific project.
 */
export function useContainers({ projectId, onToast }: UseContainersOptions) {
  const [containers, setContainers] = useState<ContainerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const baseUrl = `${API_BASE}/api/projects/${projectId}/containers`;

  const fetchContainers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(baseUrl);
      const data = await res.json();
      if (Array.isArray(data)) {
        setContainers(data);
      }
    } catch (err) {
      console.error('Failed to fetch containers:', err);
    } finally {
      setLoading(false);
    }
  }, [baseUrl]);

  const createContainer = useCallback(async (name: string) => {
    try {
      setCreating(true);
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        onToast?.(`Node "${name}" created successfully`);
        fetchContainers();
      } else {
        const error = await res.json();
        onToast?.(`Failed: ${error.error}`);
      }
    } catch (err) {
      console.error(err);
      onToast?.('Error creating container node');
    } finally {
      setCreating(false);
    }
  }, [baseUrl, fetchContainers, onToast]);

  const startContainer = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${baseUrl}/${id}/start`, { method: 'POST' });
      if (res.ok) fetchContainers();
    } catch (err) {
      console.error(err);
    }
  }, [baseUrl, fetchContainers]);

  const stopContainer = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${baseUrl}/${id}/stop`, { method: 'POST' });
      if (res.ok) fetchContainers();
    } catch (err) {
      console.error(err);
    }
  }, [baseUrl, fetchContainers]);

  const deleteContainer = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${baseUrl}/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setContainers(prev => prev.filter(c => c.id !== id));
        onToast?.('Container deleted');
        fetchContainers();
        return true;
      }
    } catch (err) {
      console.error(err);
    }
    return false;
  }, [baseUrl, fetchContainers, onToast]);

  return {
    containers,
    loading,
    creating,
    fetchContainers,
    createContainer,
    startContainer,
    stopContainer,
    deleteContainer,
  };
}
