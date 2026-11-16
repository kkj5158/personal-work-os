// Shared normal Auth admin cleanup. Absence requires explicit admin GET404, never a failed DELETE alone.
export async function removeSyntheticAuthUser(authRequest, actor, runId) {
  const observation = {label:actor.label,status:"FAIL"};
  const route="/admin/users/"+actor.id;
  const before=await authRequest(route,"GET");
  observation.beforeStatus=before.status;
  if(before.status===404){observation.status="PASS_ALREADY_ABSENT";return observation;}
  const user=await before.json().catch(()=>null);
  if(!before.ok||user?.id!==actor.id||user?.email!==actor.email||user?.user_metadata?.qaRunId!==runId)throw Error("SYNTHETIC_AUTH_IDENTITY_FENCE");
  const deleted=await authRequest(route,"DELETE");
  observation.deleteStatus=deleted.status;
  // The LOG DB fixture cleanup can already have removed a mirrored row. Reconcile both successful and failed deletes by readback.
  const after=await authRequest(route,"GET");
  observation.afterStatus=after.status;
  if(after.status!==404)throw Error("SYNTHETIC_AUTH_ABSENCE_NOT_VERIFIED");
  observation.status="PASS_REMOVED";
  return observation;
}
