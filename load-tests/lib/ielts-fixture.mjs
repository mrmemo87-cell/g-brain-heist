// Shared by k6 and Node guard tests. Tokens live outside git; never log them.
export function validateIeltsFixture(base,count,fixture){
 if(!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(base)||base.includes('sozodkxwhubespiedgxm'))throw Error('Use isolated staging; production is blocked');
 if(![30,100,500].includes(count))throw Error('Run the declared 30, 100, 500 stages separately');
 if(fixture.environment!=='staging'||fixture.projectRef!==base.split('//')[1].split('.')[0])throw Error('Fixture must name this staging project');
 if(!fixture.teacher?.token||!fixture.teacher?.studentId||!fixture.teacher?.eventId)throw Error('A scoped teacher fixture is required');
 if(!Array.isArray(fixture.students)||fixture.students.length!==count)throw Error('Exactly one fresh student fixture per VU is required');
 for(const key of ['studentId','token','assignmentId'])if(new Set(fixture.students.map(s=>s[key])).size!==count)throw Error('Student identities, tokens and assignments must be distinct');
 if(fixture.students.some(s=>!s.studentId||!s.token||!s.eventId||!s.assignmentId||!['reading','listening','writing'].includes(s.section)||!s.edits?.length||s.edits.length>60||!s.finalPayload||!s.idempotencyKey))throw Error('Complete fresh fixtures and expected final evidence are required');
 if(new Set(fixture.students.map(s=>s.idempotencyKey)).size!==count)throw Error('Idempotency keys must be unique per attempt');
 if(fixture.students.some(s=>s.token===fixture.teacher.token||s.studentId===fixture.teacher.studentId))throw Error('Teacher must be a separate identity');
 return fixture;
}
