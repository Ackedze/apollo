import type {
  CompositionConstraint,
  CompositionConstraintDecision,
  CompositionConstraintEvaluator,
  CompositionContractContext,
  CountBetweenConstraint,
  PropertyEqualsFirstConstraint,
  PropertyEqualsHostConstraint,
  PropertyDomainConstraint,
  PropertySequenceConstraint,
  ValuePositionConstraint,
} from './compositionContractTypes';

const evaluateCountBetween: CompositionConstraintEvaluator<CountBetweenConstraint> = (
  constraint,
  context,
) => {
  const count = context.members.length;
  if (count >= constraint.min && count <= constraint.max) {
    return [];
  }
  return [{
    verdict: 'violation',
    contractId: context.contract.id,
    constraintId: constraint.id,
    message: constraint.message,
    target: null,
    property: null,
    expected: `${constraint.min}-${constraint.max}`,
    actual: count,
    evidence: { actualCount: count, min: constraint.min, max: constraint.max },
    remediation: null,
  }];
};

const evaluatePropertyDomain: CompositionConstraintEvaluator<PropertyDomainConstraint> = (
  constraint,
  context,
) => context.members.flatMap((member) => {
  const actual = member.variantProperties[constraint.property];
  const expected = member.expectedVariantProperties[constraint.property] ?? null;
  if (!actual) {
    return [];
  }
  if (!constraint.values.includes(actual)) {
    return [propertyDecision({
      verdict: 'violation',
      context,
      constraint,
      member,
      expected,
      actual,
      remediationValue:
        constraint.values.length === 1 ? constraint.values[0] : null,
      evidence: { allowedValues: constraint.values.slice() },
    })];
  }
  if (expected && expected !== actual) {
    return [propertyDecision({
      verdict: 'expected',
      context,
      constraint,
      member,
      expected,
      actual,
      remediationValue: null,
      evidence: { allowedValues: constraint.values.slice() },
    })];
  }
  return [];
});

const evaluateValuePosition: CompositionConstraintEvaluator<ValuePositionConstraint> = (
  constraint,
  context,
) => {
  const matching = context.members.filter(
    (member) => member.variantProperties[constraint.property] === constraint.value,
  );
  const decisions: CompositionConstraintDecision[] = [];
  for (const member of matching) {
    const positionAllowed = constraint.positions.some((position) =>
      matchesPosition(position, member.position, member.count),
    );
    if (!positionAllowed) {
      decisions.push(propertyDecision({
        verdict: 'violation',
        context,
        constraint,
        member,
        expected:
          constraint.replacement ??
          member.expectedVariantProperties[constraint.property] ??
          null,
        actual: constraint.value,
        remediationValue: constraint.replacement ?? null,
        evidence: {
          actualPosition: member.position,
          allowedPositions: constraint.positions.slice(),
          matchingCount: matching.length,
          maxCount: constraint.maxCount ?? null,
        },
      }));
      continue;
    }
    const expected = member.expectedVariantProperties[constraint.property] ?? null;
    if (expected && expected !== constraint.value) {
      decisions.push(propertyDecision({
        verdict: 'expected',
        context,
        constraint,
        member,
        expected,
        actual: constraint.value,
        remediationValue: null,
        evidence: {
          actualPosition: member.position,
          allowedPositions: constraint.positions.slice(),
          matchingCount: matching.length,
          maxCount: constraint.maxCount ?? null,
        },
      }));
    }
  }

  if (constraint.maxCount !== undefined) {
    const positionValid = matching.filter((member) =>
      constraint.positions.some((position) =>
        matchesPosition(position, member.position, member.count),
      ),
    );
    const candidates = positionValid.slice(constraint.maxCount);
    for (const member of candidates) {
      decisions.push(propertyDecision({
        verdict: 'violation',
        context,
        constraint,
        member,
        expected:
          constraint.replacement ??
          member.expectedVariantProperties[constraint.property] ??
          null,
        actual: constraint.value,
        remediationValue: constraint.replacement ?? null,
        evidence: {
          actualPosition: member.position,
          allowedPositions: constraint.positions.slice(),
          matchingCount: matching.length,
          maxCount: constraint.maxCount,
        },
      }));
    }
  }

  return decisions;
};

const evaluatePropertyEqualsHost: CompositionConstraintEvaluator<PropertyEqualsHostConstraint> = (
  constraint,
  context,
) => {
  const hostProperty = constraint.hostProperty ?? constraint.property;
  const expected = context.host.variantProperties[hostProperty];
  if (!expected) {
    return [];
  }
  return context.members.flatMap((member) => {
    const actual = member.variantProperties[constraint.property];
    if (!actual || actual === expected) {
      return [];
    }
    return [propertyDecision({
      verdict: 'violation',
      context,
      constraint,
      member,
      expected,
      actual,
      remediationValue: expected,
      evidence: {
        hostProperty,
        hostValue: expected,
        memberProperty: constraint.property,
      },
    })];
  });
};

const evaluatePropertyEqualsFirst: CompositionConstraintEvaluator<PropertyEqualsFirstConstraint> = (
  constraint,
  context,
) => {
  const source = context.members.find(
    (member) => Boolean(member.variantProperties[constraint.property]),
  );
  const expected = source?.variantProperties[constraint.property];
  if (!source || !expected) {
    return [];
  }
  return context.members.flatMap((member) => {
    if (member.nodeId === source.nodeId) {
      return [];
    }
    const actual = member.variantProperties[constraint.property];
    if (!actual || actual === expected) {
      return [];
    }
    return [propertyDecision({
      verdict: 'violation',
      context,
      constraint,
      member,
      expected,
      actual,
      remediationValue: expected,
      evidence: {
        sourceNodeId: source.nodeId,
        sourceNodeName: source.nodeName,
        sourceValue: expected,
        property: constraint.property,
      },
    })];
  });
};

const evaluatePropertySequence: CompositionConstraintEvaluator<PropertySequenceConstraint> = (
  constraint,
  context,
) => context.members.flatMap((member, index) => {
  const expected = constraint.values[index];
  const actual = member.variantProperties[constraint.property];
  if (!expected || !actual || actual === expected) {
    return [];
  }
  return [propertyDecision({
    verdict: 'violation',
    context,
    constraint,
    member,
    expected,
    actual,
    remediationValue: expected,
    evidence: {
      property: constraint.property,
      position: member.position,
      expectedSequence: constraint.values.slice(),
    },
  })];
});

const evaluators = {
  countBetween: evaluateCountBetween,
  propertyDomain: evaluatePropertyDomain,
  valuePosition: evaluateValuePosition,
  propertyEqualsHost: evaluatePropertyEqualsHost,
  propertyEqualsFirst: evaluatePropertyEqualsFirst,
  propertySequence: evaluatePropertySequence,
};

export function evaluateCompositionConstraint(
  constraint: CompositionConstraint,
  context: CompositionContractContext,
): CompositionConstraintDecision[] {
  const evaluator = evaluators[constraint.op] as CompositionConstraintEvaluator<any>;
  return evaluator(constraint, context);
}

function propertyDecision(options: {
  verdict: 'expected' | 'violation';
  context: CompositionContractContext;
  constraint:
    | PropertyDomainConstraint
    | ValuePositionConstraint
    | PropertyEqualsHostConstraint
    | PropertyEqualsFirstConstraint
    | PropertySequenceConstraint;
  member: CompositionContractContext['members'][number];
  expected: string | null;
  actual: string;
  remediationValue: string | null;
  evidence: Record<string, unknown>;
}): CompositionConstraintDecision {
  return {
    verdict: options.verdict,
    contractId: options.context.contract.id,
    constraintId: options.constraint.id,
    message: options.constraint.message,
    target: options.member,
    property: options.constraint.property,
    expected: options.expected,
    actual: options.actual,
    evidence: options.evidence,
    remediation:
      options.verdict === 'violation' && options.remediationValue
        ? {
            kind: 'set-variant-properties',
            nodeId: options.member.nodeId,
            properties: {
              [options.constraint.property]: options.remediationValue,
            },
          }
        : null,
  };
}

function matchesPosition(
  expected: 'first' | 'last' | number,
  actual: number,
  count: number,
): boolean {
  if (typeof expected === 'number') return expected === actual;
  return expected === 'first' ? actual === 1 : actual === count;
}
