import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validatePrerequisitesFromTree,
  type PrerequisiteNodeData,
  type StudentTranscript,
} from '../shared/prerequisite-evaluator'

function transcript(overrides: Partial<StudentTranscript> = {}): StudentTranscript {
  return {
    completedCourses: [],
    currentYear: 'FOURTH_YEAR',
    hasSpecialPermission: false,
    ...overrides,
  }
}

test('passes course prerequisite when completed', () => {
  const nodes: PrerequisiteNodeData[] = [
    {
      id: 'course-1',
      nodeType: 'COURSE',
      requiredCourseId: 'COMP1006',
      requiredYear: null,
      requiredGrade: null,
      parentId: null,
    },
  ]

  const result = validatePrerequisitesFromTree(
    'COMP1006',
    nodes,
    transcript({ completedCourses: ['COMP1006'] })
  )

  assert.equal(result.isValid, true)
  assert.equal(result.expressionEvaluated, 'COMP1006')
})

test('fails AND prerequisite when one child is missing', () => {
  const nodes: PrerequisiteNodeData[] = [
    { id: 'root', nodeType: 'AND', requiredCourseId: null, requiredYear: null, requiredGrade: null, parentId: null },
    { id: 'a', nodeType: 'COURSE', requiredCourseId: 'COMP2000', requiredYear: null, requiredGrade: null, parentId: 'root' },
    { id: 'b', nodeType: 'COURSE', requiredCourseId: 'SYSC2004', requiredYear: null, requiredGrade: null, parentId: 'root' },
  ]

  const result = validatePrerequisitesFromTree(
    'COMP2000 && SYSC2004',
    nodes,
    transcript({ completedCourses: ['COMP2000'] })
  )

  assert.equal(result.isValid, false)
  assert.deepEqual(result.missingCourses, ['SYSC2004'])
})

test('passes OR prerequisite when one alternative is satisfied', () => {
  const nodes: PrerequisiteNodeData[] = [
    { id: 'root', nodeType: 'OR', requiredCourseId: null, requiredYear: null, requiredGrade: null, parentId: null },
    { id: 'a', nodeType: 'COURSE', requiredCourseId: 'COMP3005', requiredYear: null, requiredGrade: null, parentId: 'root' },
    { id: 'b', nodeType: 'COURSE', requiredCourseId: 'SYSC3110', requiredYear: null, requiredGrade: null, parentId: 'root' },
  ]

  const result = validatePrerequisitesFromTree(
    'COMP3005 || SYSC3110',
    nodes,
    transcript({ completedCourses: ['SYSC3110'] })
  )

  assert.equal(result.isValid, true)
})

test('permission is not auto-satisfied', () => {
  const nodes: PrerequisiteNodeData[] = [
    { id: 'root', nodeType: 'OR', requiredCourseId: null, requiredYear: null, requiredGrade: null, parentId: null },
    { id: 'a', nodeType: 'COURSE', requiredCourseId: 'COMP3005', requiredYear: null, requiredGrade: null, parentId: 'root' },
    { id: 'b', nodeType: 'PERMISSION', requiredCourseId: null, requiredYear: null, requiredGrade: null, parentId: 'root' },
  ]

  const result = validatePrerequisitesFromTree(
    'COMP3005 || PERMISSION',
    nodes,
    transcript()
  )

  assert.equal(result.isValid, false)
  assert.equal(result.needsPermission, true)
  assert.deepEqual(result.missingCourses, ['COMP3005'])
})

test('year standing is enforced', () => {
  const nodes: PrerequisiteNodeData[] = [
    { id: 'root', nodeType: 'YEAR_STANDING', requiredCourseId: null, requiredYear: 'THIRD_YEAR', requiredGrade: null, parentId: null },
  ]

  const result = validatePrerequisitesFromTree(
    'THIRD_YEAR',
    nodes,
    transcript({ currentYear: 'SECOND_YEAR' })
  )

  assert.equal(result.isValid, false)
  assert.equal(result.yearRequirement, 'THIRD_YEAR')
})

test('grade requirements are enforced', () => {
  const nodes: PrerequisiteNodeData[] = [
    { id: 'root', nodeType: 'COURSE', requiredCourseId: 'MATH1004', requiredYear: null, requiredGrade: 'B-', parentId: null },
  ]

  const result = validatePrerequisitesFromTree(
    'MATH1004[B-]',
    nodes,
    transcript({
      completedCourses: ['MATH1004'],
      courseGrades: { MATH1004: 'C' },
    })
  )

  assert.equal(result.isValid, false)
  assert.match(result.reason || '', /does not meet requirement/)
  assert.equal(result.gradeIssues?.length, 1)
})

test('missing prerequisite expression is treated as no prerequisite', () => {
  const result = validatePrerequisitesFromTree(undefined, [], transcript())

  assert.equal(result.isValid, true)
  assert.equal(result.expressionEvaluated, 'None')
})
