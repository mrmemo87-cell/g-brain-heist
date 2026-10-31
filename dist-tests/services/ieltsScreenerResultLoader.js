/** Completed whoami responses omit the form. Identify results from saved evidence. */
export async function loadIeltsSavedScreenerResult(attemptId, readWriting, readObjective) {
    const writing = await readWriting(attemptId);
    if (writing)
        return { kind: 'writing', result: writing };
    const objective = await readObjective(attemptId);
    return objective ? { kind: 'objective', result: objective } : null;
}
