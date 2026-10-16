'use strict';
const strategyForm=document.getElementById('strategyForm');
function renderStrategy(){
 const costResult=document.getElementById('costResult');
 try{
   const values=Object.fromEntries(new FormData(strategyForm)),input={...values,rate:Rental.machines[values.machine].rate};
   const p=RentalPolicy.advance(input);
   document.getElementById('policyResult').textContent=`预计机械费${p.total.toLocaleString('zh-CN')}元；${p.coveredDays}天资金覆盖方案，首期预付${p.advance.toLocaleString('zh-CN')}元（${p.percent}%）。原3万元可覆盖${p.current30000Days.toFixed(2)}天。`;
   if(values.costPerHour===''||values.upfront===''){costResult.textContent='尚未填写完整成本，暂不估算利润或成本覆盖额。';return;}
   const c=RentalPolicy.costCoverage(input);
   costResult.textContent=`按填写成本：项目成本约${c.totalCost.toLocaleString('zh-CN')}元，项目结余约${c.contribution.toLocaleString('zh-CN')}元（占收入${c.margin.toFixed(2)}%）；首期资金成本覆盖额约${c.fundingFloor.toLocaleString('zh-CN')}元。${c.aboveRevenue?'资金成本覆盖额超过预计租金，应重新核对成本、报价与付款条件。':''}未填入的成本、欠款和成交率变化不会被系统自动考虑。`;
 }catch(error){document.getElementById('policyResult').textContent=error.message;costResult.textContent='';}
}
strategyForm.addEventListener('input',renderStrategy);strategyForm.addEventListener('submit',e=>e.preventDefault());renderStrategy();
