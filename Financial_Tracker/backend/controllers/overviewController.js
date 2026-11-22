import {
  getOverviewData, setIncome, createSubscription, deleteSubscription,
  createOutgoing, deleteOutgoing, createGoal, deleteGoal, createGoalItem,
  deleteGoalItem, updateGoalItemPurchased, addGoalSavings
} from '../models/overviewModel.js';

const validUserId = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const positiveId = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

async function getOverview(req, res) {
  try {
    const userId = req.user.id;
    if (!validUserId(userId)) return res.status(400).json({ message: 'Invalid user.' });
    return res.json({ success: true, overview: await getOverviewData(userId) });
  } catch (e) { console.error('getOverview:', e); return res.status(500).json({ message: 'Could not load dashboard data.' }); }
}
async function updateIncome(req, res) {
  try {
    const userId = req.user.id, amount = Number(req.body.income);
    if (!validUserId(userId) || !Number.isFinite(amount) || amount < 0) return res.status(400).json({ message: 'Invalid income details.' });
    await setIncome(userId, amount); return res.json({ success: true });
  } catch (e) { console.error('updateIncome:', e); return res.status(500).json({ message: 'Could not update income.' }); }
}
async function addSubscription(req, res) {
  try {
    const { name, cost, renewalDate, type, frequency } = req.body; const userId = req.user.id;
    const amount = Number(cost);
    if (!validUserId(userId) || !String(name || '').trim() || !(amount > 0) || !Number.isFinite(amount) || !validDate(renewalDate) || !['weekly','monthly','yearly'].includes(frequency)) return res.status(400).json({ message: 'Check the subscription details.' });
    const id = await createSubscription(Number(userId), { sub_name: String(name).trim(), sub_cost: amount, renewal_date: renewalDate, sub_type: String(type || 'Other').trim(), sub_frequency: frequency });
    return res.status(201).json({ success: true, id });
  } catch (e) { console.error('addSubscription:', e); return res.status(500).json({ message: 'Could not add subscription.' }); }
}
async function removeSubscription(req, res) {
  try { const userId = req.user.id, id = Number(req.params.id); if (!validUserId(userId) || !positiveId(id)) return res.status(400).json({ message: 'Invalid subscription.' }); const n = await deleteSubscription(userId,id); if (!n) return res.status(404).json({ message: 'Subscription not found.' }); return res.json({success:true}); }
  catch(e) { console.error('removeSubscription:',e); return res.status(500).json({message:'Could not delete subscription.'}); }
}
async function addOutgoing(req, res) {
  try { const {name,cost,renewalDate,frequency}=req.body;const userId=req.user.id; const amount=Number(cost); if(!validUserId(userId)||!String(name||'').trim()||!Number.isFinite(amount)||amount<=0||!validDate(renewalDate)||!['monthly','yearly'].includes(frequency)) return res.status(400).json({message:'Check the outgoing details.'}); const id=await createOutgoing(Number(userId),{outgoing_name:String(name).trim(),cost:amount,renewal_date:renewalDate,frequency}); return res.status(201).json({success:true,id}); }
  catch(e){console.error('addOutgoing:',e);return res.status(500).json({message:'Could not add outgoing.'});}
}
async function removeOutgoing(req,res){
  try{const userId=req.user.id,id=Number(req.params.id);if(!validUserId(userId)||!positiveId(id))return res.status(400).json({message:'Invalid outgoing.'});const n=await deleteOutgoing(userId,id);if(!n)return res.status(404).json({message:'Outgoing not found.'});return res.json({success:true});}
  catch(e){console.error('removeOutgoing:',e);return res.status(500).json({message:'Could not delete outgoing.'});}
}
async function addGoal(req,res){
  try{const {name,date}=req.body;const userId=req.user.id;if(!validUserId(userId)||!String(name||'').trim()||!validDate(date))return res.status(400).json({message:'Enter a goal name and valid date.'});const id=await createGoal(Number(userId),String(name).trim(),date);return res.status(201).json({success:true,id});}
  catch(e){console.error('addGoal:',e);return res.status(500).json({message:'Could not add goal.'});}
}
async function removeGoal(req,res){
  try{const userId=req.user.id,goalId=Number(req.params.id);if(!validUserId(userId)||!positiveId(goalId))return res.status(400).json({message:'Invalid goal.'});const n=await deleteGoal(userId,goalId);if(!n)return res.status(404).json({message:'Goal not found.'});return res.json({success:true});}
  catch(e){console.error('removeGoal:',e);return res.status(500).json({message:'Could not delete goal.'});}
}
async function addGoalItem(req,res){
  try{const userId=req.user.id,goalId=Number(req.params.id),{label,cost}=req.body,amount=Number(cost);if(!validUserId(userId)||!positiveId(goalId)||!String(label||'').trim()||!Number.isFinite(amount)||amount<=0)return res.status(400).json({message:'Enter an item name and positive cost.'});const id=await createGoalItem(userId,goalId,String(label).trim(),amount);if(!id)return res.status(404).json({message:'Goal not found.'});return res.status(201).json({success:true,id});}
  catch(e){console.error('addGoalItem:',e);return res.status(500).json({message:'Could not add goal item.'});}
}
async function removeGoalItem(req,res){
  try{const userId=req.user.id,goalId=Number(req.params.id),itemId=Number(req.params.itemId);if(!validUserId(userId)||!positiveId(goalId)||!positiveId(itemId))return res.status(400).json({message:'Invalid goal item.'});const n=await deleteGoalItem(userId,goalId,itemId);if(!n)return res.status(404).json({message:'Goal item not found.'});return res.json({success:true});}
  catch(e){console.error('removeGoalItem:',e);return res.status(500).json({message:'Could not delete goal item.'});}
}
async function setGoalItemPurchased(req,res){
  try{const userId=req.user.id,goalId=Number(req.params.id),itemId=Number(req.params.itemId),purchased=req.body.purchased;if(!validUserId(userId)||!positiveId(goalId)||!positiveId(itemId)||typeof purchased!=='boolean')return res.status(400).json({message:'Invalid purchased status.'});const n=await updateGoalItemPurchased(userId,goalId,itemId,purchased);if(!n)return res.status(404).json({message:'Goal item not found.'});return res.json({success:true});}
  catch(e){console.error('setGoalItemPurchased:',e);return res.status(500).json({message:'Could not update purchased status.'});}
}
async function saveGoalMoney(req,res){
  try{const userId=req.user.id,goalId=Number(req.params.id),amount=Number(req.body.amount);if(!validUserId(userId)||!positiveId(goalId)||!Number.isFinite(amount)||amount<=0)return res.status(400).json({message:'Enter a valid savings amount.'});const n=await addGoalSavings(userId,goalId,amount);if(!n)return res.status(404).json({message:'Goal not found.'});return res.json({success:true});}
  catch(e){console.error('saveGoalMoney:',e);return res.status(500).json({message:'Could not save money towards this goal.'});}
}
export { getOverview, updateIncome, addSubscription, removeSubscription, addOutgoing, removeOutgoing, addGoal, removeGoal, addGoalItem, removeGoalItem, setGoalItemPurchased, saveGoalMoney };