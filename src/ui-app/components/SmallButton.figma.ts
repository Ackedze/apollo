// url=https://www.figma.com/design/I3MsagXR8Tz2eZcGtIgUk8/%E2%9D%87%EF%B8%8F-%D0%9C%D0%B0%D1%81%D1%82%D0%B5%D1%80%D1%81%D0%BA%D0%B0%D1%8F----AI?node-id=8965-13732
// source=src/ui-app/components/SmallButton.tsx
// component=SmallButton
import figma from 'figma';

const instance = figma.selectedInstance;

const labelText = instance.findText('Сбросить');
const label = labelText.type === 'TEXT' ? labelText.textContent : 'Сбросить';
const hovered = instance.getEnum('hover', {
  false: false,
  true: true,
});
const singleIcon = instance.getEnum('singleIcon', {
  true: true,
  false: false,
});
const icon = instance.findInstance('diamonds', { traverseInstances: true });
let iconCode;

if (icon && icon.type === 'INSTANCE') {
  iconCode = icon.executeTemplate().example;
}

export default {
  example: figma.code`
    <SmallButton
      label="${label}"
      ${hovered ? 'hovered' : ''}
      ${singleIcon ? 'singleIcon' : ''}
      ${iconCode ? figma.code`icon={${iconCode}}` : ''}
    />
  `,
  imports: ['import { SmallButton } from "./SmallButton";'],
  id: 'apollo-small-button',
  metadata: {
    nestable: true,
  },
};
