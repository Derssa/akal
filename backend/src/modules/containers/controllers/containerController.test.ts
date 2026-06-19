import request from 'supertest';
import express from 'express';
import { ContainerController } from './containerController';
import { ContainerService } from '../services/containerService';
import { ProjectService } from '../../projects/services/projectService';
import { NetworkService } from '../../network/services/networkService';

// Mock Services
jest.mock('../services/containerService');
jest.mock('../../projects/services/projectService');
jest.mock('../../network/services/networkService');

const app = express();
app.use(express.json());

app.get('/api/projects/:projectId/containers', ContainerController.list);
app.post('/api/projects/:projectId/containers', ContainerController.create);
app.post('/api/containers/:id/start', ContainerController.start);
app.post('/api/containers/:id/stop', ContainerController.stop);
app.delete('/api/containers/:id', ContainerController.delete);

describe('ContainerController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/projects/:projectId/containers', () => {
    it('should return a list of containers', async () => {
      const mockContainers = [
        { id: '1', name: 'ubuntu-1', image: 'ubuntu', state: 'running', status: 'up' }
      ];
      (ContainerService.listContainers as jest.Mock).mockResolvedValue(mockContainers);

      const res = await request(app).get('/api/projects/test-project/containers');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockContainers);
      expect(ContainerService.listContainers).toHaveBeenCalledWith('test-project');
    });

    it('should handle errors cleanly and return 500 status', async () => {
      (ContainerService.listContainers as jest.Mock).mockRejectedValue(new Error('Docker error'));

      const res = await request(app).get('/api/projects/test-project/containers');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Docker error' });
    });
  });

  describe('POST /api/projects/:projectId/containers', () => {
    it('should create a container and trigger network policy re-application', async () => {
      const mockContainer = { id: '1', name: 'ubuntu-1', image: 'ubuntu', state: 'running', status: 'up' };
      (ContainerService.createContainer as jest.Mock).mockResolvedValue(mockContainer);
      (ProjectService.getNetworkConfig as jest.Mock).mockResolvedValue({ some: 'config' });
      (NetworkService.applyPolicy as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/projects/test-project/containers')
        .send({ name: 'ubuntu-1', type: 'ubuntu' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(mockContainer);
      expect(ContainerService.createContainer).toHaveBeenCalledWith('test-project', 'ubuntu-1', 'ubuntu');
      expect(ProjectService.getNetworkConfig).toHaveBeenCalledWith('test-project');
      expect(NetworkService.clearPolicyHash).toHaveBeenCalledWith('test-project');
      expect(NetworkService.applyPolicy).toHaveBeenCalledWith('test-project', { some: 'config' });
    });

    it('should return 400 if name is missing', async () => {
      const res = await request(app)
        .post('/api/projects/test-project/containers')
        .send({ type: 'ubuntu' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Name is required' });
    });
  });
});
