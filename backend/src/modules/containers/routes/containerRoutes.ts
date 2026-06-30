import { Router } from 'express';
import { ContainerController } from '../controllers/containerController';
import { AsgController } from '../controllers/asgController';

const router = Router({ mergeParams: true });

router.get('/', ContainerController.list);
router.post('/', ContainerController.create);
router.post('/:id/start', ContainerController.start);
router.post('/:id/stop', ContainerController.stop);
router.delete('/:id', ContainerController.delete);
router.get('/:id/postgres/explorer', ContainerController.postgresExplorer);
router.post('/:id/postgres/query', ContainerController.postgresQuery);
router.get('/:id/nosql/explorer', ContainerController.nosqlExplorer);
router.post('/:id/nosql/query', ContainerController.nosqlQuery);
router.get('/:id/redis/explorer', ContainerController.redisExplorer);
router.post('/:id/redis/query', ContainerController.redisQuery);
router.post('/:id/scale', ContainerController.scale);

// ASG Routes
router.post('/asg/:asgId/deploy', AsgController.deploy);
router.post('/asg/:asgId/scale', AsgController.scale);
router.post('/asg/terminate', AsgController.terminate);

export default router;
