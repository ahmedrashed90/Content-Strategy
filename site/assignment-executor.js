// Resolve the exception from the executor directory. Duplicate names fail closed.
export function mayOmitDeadline(executors, userId, departmentId) {
  if (!userId || !departmentId) return false;
  const matches = executors.filter(person => person.full_name?.trim() === 'أحمد ناجي');
  return matches.some(person => person.user_id === userId && person.department_id === departmentId)
    && matches.every(person => person.user_id === userId);
}
