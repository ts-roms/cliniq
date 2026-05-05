import type { Meta, StoryObj } from '@storybook/react-vite';
import { Select } from './select';
import { Label } from './label';

const meta: Meta<typeof Select> = {
  title: 'Components/Select',
  component: Select,
};

export default meta;
type Story = StoryObj<typeof Select>;

export const Sex: Story = {
  render: () => (
    <div className="w-72 space-y-1.5">
      <Label htmlFor="sex">Sex</Label>
      <Select id="sex" defaultValue="UNDISCLOSED">
        <option value="FEMALE">Female</option>
        <option value="MALE">Male</option>
        <option value="OTHER">Other</option>
        <option value="UNDISCLOSED">Undisclosed</option>
      </Select>
    </div>
  ),
};
