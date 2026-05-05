import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';
import { Button } from './button';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Sign in to ClinIQ</CardTitle>
        <CardDescription>Use the email tied to your clinic account.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Form goes here.</p>
      </CardContent>
      <CardFooter className="justify-end">
        <Button>Continue</Button>
      </CardFooter>
    </Card>
  ),
};

export const Stats: Story = {
  render: () => (
    <div className="grid w-[640px] grid-cols-3 gap-4">
      {['Patients', 'Consults today', 'Pending Rx'].map((label, i) => (
        <Card key={label}>
          <CardHeader>
            <CardDescription>{label}</CardDescription>
            <CardTitle className="text-3xl font-extralight">
              {[2148, 32, 7][i]}
            </CardTitle>
          </CardHeader>
        </Card>
      ))}
    </div>
  ),
};
