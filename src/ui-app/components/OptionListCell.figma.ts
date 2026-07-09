// url=https://www.figma.com/design/I3MsagXR8Tz2eZcGtIgUk8/%E2%9D%87%EF%B8%8F-%D0%9C%D0%B0%D1%81%D1%82%D0%B5%D1%80%D1%81%D0%BA%D0%B0%D1%8F----AI?node-id=9353-8051
// source=src/ui-app/components/OptionListCell.tsx
// component=OptionListCell
import figma from 'figma';

const instance = figma.selectedInstance;

const labelText = instance.findText('Label');
const label = labelText.type === 'TEXT' ? labelText.textContent : 'Label';
const hovered = instance.getEnum('hover', {
  false: false,
  true: true,
});
const selected = instance.getEnum('selected', {
  false: false,
  true: true,
});
const leadingIcon = instance.findInstance('LeftAddon', { traverseInstances: true });
const trailingIcon = instance.findInstance('RightAddon', { traverseInstances: true });
let leadingIconCode;
let trailingIconCode;

if (leadingIcon && leadingIcon.type === 'INSTANCE') {
  leadingIconCode = leadingIcon.executeTemplate().example;
}

if (trailingIcon && trailingIcon.type === 'INSTANCE') {
  trailingIconCode = trailingIcon.executeTemplate().example;
}

export default {
  example: figma.code`
    <OptionListCell
      label="${label}"
      ${hovered ? 'hovered' : ''}
      ${selected ? 'selected' : ''}
      ${leadingIconCode ? figma.code`leadingIcon={${leadingIconCode}}` : ''}
      ${selected && trailingIconCode ? figma.code`trailingIcon={${trailingIconCode}}` : ''}
    />
  `,
  imports: ['import { OptionListCell } from "./OptionListCell";'],
  id: 'apollo-option-list-cell',
  metadata: {
    nestable: true,
  },
};
