import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Alert, AlertDescription, AlertTitle } from './alert';
import { Badge } from './badge';
import { Button } from './button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card';
import { Checkbox } from './checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Input } from './input';
import { Label } from './label';
import { ScrollArea, ScrollBar } from './scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';
import { Separator } from './separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet';
import { Skeleton } from './skeleton';
import { Toaster } from './sonner';
import { Switch } from './switch';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from './table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';
import { ThemeProvider } from '@/components/theme-provider';

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'system',
    setTheme: vi.fn(),
    resolvedTheme: 'light',
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('ui primitives', () => {
  it('renders core form and layout pieces', () => {
    render(
      <div>
        <Alert>
          <AlertTitle>Title</AlertTitle>
          <AlertDescription>Body</AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertDescription>Bad</AlertDescription>
        </Alert>
        <Badge>Default</Badge>
        <Badge variant="secondary">Sec</Badge>
        <Badge variant="outline">Out</Badge>
        <Badge variant="destructive">Danger</Badge>
        <Button>Go</Button>
        <Button asChild>
          <a href="/x">Link</a>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Card</CardTitle>
            <CardDescription>Desc</CardDescription>
          </CardHeader>
          <CardContent>Content</CardContent>
          <CardFooter>Footer</CardFooter>
        </Card>
        <Checkbox aria-label="check" />
        <Input aria-label="field" />
        <Label>Label</Label>
        <Separator />
        <Separator orientation="vertical" />
        <Skeleton className="h-4 w-4" />
        <Switch aria-label="sw" />
      </div>,
    );
    expect(screen.getByText('Title')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'check' }));
    fireEvent.click(screen.getByRole('switch', { name: 'sw' }));
  });

  it('renders composite primitives', async () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="light">
        <TooltipProvider>
          <Table>
            <TableCaption>Cap</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>H</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>C</TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>F</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <Tabs defaultValue="a">
            <TabsList>
              <TabsTrigger value="a">A</TabsTrigger>
              <TabsTrigger value="b">B</TabsTrigger>
            </TabsList>
            <TabsContent value="a">One</TabsContent>
            <TabsContent value="b">Two</TabsContent>
          </Tabs>
          <Select defaultValue="en">
            <SelectTrigger aria-label="lang">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Lang</SelectLabel>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
                <SelectSeparator />
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select defaultValue="en">
            <SelectTrigger aria-label="lang2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="item-aligned">
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
          <Sheet>
            <SheetTrigger>Open sheet</SheetTrigger>
            <SheetContent side="top">
              <SheetHeader>
                <SheetTitle>Sheet</SheetTitle>
                <SheetDescription>Desc</SheetDescription>
              </SheetHeader>
              <SheetFooter>Foot</SheetFooter>
            </SheetContent>
          </Sheet>
          <Sheet>
            <SheetTrigger>Open bottom</SheetTrigger>
            <SheetContent side="bottom">
              <SheetTitle>Bottom</SheetTitle>
            </SheetContent>
          </Sheet>
          <Sheet>
            <SheetTrigger>Open right</SheetTrigger>
            <SheetContent>
              <SheetTitle>Right</SheetTitle>
            </SheetContent>
          </Sheet>
          <Tooltip>
            <TooltipTrigger>Tip</TooltipTrigger>
            <TooltipContent>Hint</TooltipContent>
          </Tooltip>
          <ScrollArea className="h-20 w-20">
            <div className="h-40">Tall</div>
            <ScrollBar orientation="horizontal" />
            <ScrollBar orientation="vertical" />
          </ScrollArea>
          <DropdownMenu open>
            <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel inset>Label</DropdownMenuLabel>
              <DropdownMenuItem inset>Item</DropdownMenuItem>
              <DropdownMenuCheckboxItem checked>Check</DropdownMenuCheckboxItem>
              <DropdownMenuRadioGroup value="a">
                <DropdownMenuRadioItem value="a">A</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSub open>
                <DropdownMenuSubTrigger inset>Sub</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem>Child</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuShortcut>⌘K</DropdownMenuShortcut>
            </DropdownMenuContent>
          </DropdownMenu>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText('Open sheet'));
    expect(await screen.findByText('Sheet')).toBeInTheDocument();
    expect(screen.getByText('Item')).toBeInTheDocument();
    expect(screen.getByText('Cap')).toBeInTheDocument();
  });
});
