# hurumhorology-posts-view

Hurumhorology posts view with React components packages for hurumhorology developments

## Getting Started

### Install hurumhorology-posts-view

Install `hurumhorology-posts-view` package:

1. Run the following command to install `hurumhorology-posts-view`:

```
npm i hurumhorology-posts-view
```

### Try it out

In general, you can just import the components you want to use from hurumhorology-posts-view and use them in a React .jsx

For general use, you need to ensure component's props type.

file:

```tsx
import { JournalView, JournalViewProps } from "hurumhorology-posts-view";

interface Props extends JournalViewProps {}

export default function MyPage(props: Props) {
  return (
    <div>
      <JournalView journal={props.journal} />
    </div>
  );
}
```

