import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './input';
import { Label } from './label';

const meta: Meta<typeof Input> = {
  title: 'Components/Input',
  component: Input,
  args: { placeholder: 'MRN-001' },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {};

export const WithLabel: Story = {
  render: (args) => (
    <div className="w-72 space-y-1.5">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" {...args} placeholder="doc@acme.ph" />
    </div>
  ),
};

export const Disabled: Story = { args: { disabled: true, value: 'Locked' } };
