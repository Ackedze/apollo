// url=https://www.figma.com/design/I3MsagXR8Tz2eZcGtIgUk8/%E2%9D%87%EF%B8%8F-%D0%9C%D0%B0%D1%81%D1%82%D0%B5%D1%80%D1%81%D0%BA%D0%B0%D1%8F----AI?node-id=8964-11506
// source=src/ui-app/components/CounterBadge.tsx
// component=CounterBadge
import figma from 'figma';

const instance = figma.selectedInstance;

const empty = instance.getEnum('empty', {
  true: true,
  false: false,
});
const type = instance.getEnum('type', {
  empty: 'empty',
  error: 'error',
  warning: 'warning',
  general: 'general',
});
const countLayerName = empty ? '0' : '1';
const countLayer = instance.findText(countLayerName);
const countText = countLayer.type === 'TEXT' ? countLayer.textContent : countLayerName;

export default {
  example: figma.code`<CounterBadge count={${countText}} type="${type}" />`,
  imports: ['import { CounterBadge } from "./CounterBadge";'],
  id: 'apollo-counter-badge',
  metadata: {
    nestable: true,
  },
};
