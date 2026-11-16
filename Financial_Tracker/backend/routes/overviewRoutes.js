import express from 'express';
import {
  getOverview, updateIncome, addSubscription, removeSubscription,
  addOutgoing, removeOutgoing, addGoal, removeGoal, addGoalItem,
  removeGoalItem, setGoalItemPurchased, saveGoalMoney
} from '../controllers/overviewController.js';

const router = express.Router();
router.get('/', getOverview);
router.put('/income', updateIncome);
router.post('/subscriptions', addSubscription);
router.delete('/subscriptions/:id', removeSubscription);
router.post('/outgoings', addOutgoing);
router.delete('/outgoings/:id', removeOutgoing);
router.post('/goals', addGoal);
router.delete('/goals/:id', removeGoal);
router.post('/goals/:id/items', addGoalItem);
router.delete('/goals/:id/items/:itemId', removeGoalItem);
router.patch('/goals/:id/items/:itemId/purchased', setGoalItemPurchased);
router.post('/goals/:id/savings', saveGoalMoney);
export default router;
