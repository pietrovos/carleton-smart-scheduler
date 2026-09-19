import { validatePrerequisites, getPrerequisiteExplanation, StudentTranscript } from './prerequisite-validator.js'

async function testValidator() {
  console.log('[TEST] Testing Prerequisite Validation System\n')

  // Test case 1: Student with no completed courses trying to take CIVE4302
  const freshmanTranscript: StudentTranscript = {
    completedCourses: [],
    currentYear: 'FIRST_YEAR',
    hasSpecialPermission: false
  }

  console.log('[CASE] Test 1: Freshman attempting CIVE4302 (requires CIVE3203 && CIVE3206)')
  const result1 = await validatePrerequisites('CIVE4302', freshmanTranscript)
  console.log('Result:', result1)
  
  const explanation1 = await getPrerequisiteExplanation('CIVE4302', freshmanTranscript)
  console.log('Explanation:', explanation1)
  console.log('---\n')

  // Test case 2: Student with completed prerequisites
  const seniorTranscript: StudentTranscript = {
    completedCourses: ['CIVE3203', 'CIVE3206', 'MATH1004', 'PHYS1001'],
    currentYear: 'FOURTH_YEAR',
    hasSpecialPermission: false
  }

  console.log('[CASE] Test 2: Senior with prerequisites attempting CIVE4302')
  const result2 = await validatePrerequisites('CIVE4302', seniorTranscript)
  console.log('Result:', result2)

  const explanation2 = await getPrerequisiteExplanation('CIVE4302', seniorTranscript)
  console.log('Explanation:', explanation2)
  console.log('---\n')

  // Test case 3: Course with no prerequisites
  console.log('[CASE] Test 3: Attempting course with no prerequisites')
  const result3 = await validatePrerequisites('CIVE4201', freshmanTranscript)
  console.log('Result:', result3)
  console.log('---\n')

  // Test case 4: Year standing requirement  
  console.log('[CASE] Test 4: Freshman attempting CIVE4201 (requires FOURTH_YEAR)')
  const result4 = await validatePrerequisites('CIVE4201', freshmanTranscript)
  console.log('Result:', result4)

  const explanation4 = await getPrerequisiteExplanation('CIVE4201', freshmanTranscript)
  console.log('Explanation:', explanation4)
  console.log('---\n')

  console.log('[SUCCESS] Test completed successfully!')
}

testValidator().catch(console.error)