import { Router } from 'express';
import { ProjectController } from '../controllers/projectController';

const router = Router();

router.get('/', ProjectController.list);
router.post('/', ProjectController.create);
router.delete('/:id', ProjectController.delete);

export default router;
