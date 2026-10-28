'use strict';
const c=require('./contracts');
const schemas=Object.freeze({'/heartbeat':c.obj({sessionId:c.id})});
const outputs=Object.freeze({'/heartbeat':c.obj({sessionId:c.id,state:{enum:['opening','active','needs_input']}})});
module.exports={schemas,outputs};
