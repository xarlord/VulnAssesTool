import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from './dialog'

describe('Dialog components', () => {
  it('should render DialogHeader with custom className', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader className="test-header" data-testid="dialog-header">
            <DialogTitle>Test Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    )

    const header = screen.getByTestId('dialog-header')
    expect(header).toBeInTheDocument()
    expect(header.className).toContain('test-header')
  })

  it('should render DialogFooter with custom className', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogFooter className="test-footer" data-testid="dialog-footer">
            <button>Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    )

    const footer = screen.getByTestId('dialog-footer')
    expect(footer).toBeInTheDocument()
    expect(footer.className).toContain('test-footer')
  })

  it('should render DialogTitle with custom className', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle className="test-title">Custom Title</DialogTitle>
        </DialogContent>
      </Dialog>,
    )

    const title = screen.getByText('Custom Title')
    expect(title).toBeInTheDocument()
    expect(title.className).toContain('test-title')
  })

  it('should render DialogDescription with custom className', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogDescription className="test-desc">Custom description text</DialogDescription>
        </DialogContent>
      </Dialog>,
    )

    const desc = screen.getByText('Custom description text')
    expect(desc).toBeInTheDocument()
    expect(desc.className).toContain('test-desc')
  })

  it('should open dialog via trigger click', async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger data-testid="trigger">Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Opened</DialogTitle>
        </DialogContent>
      </Dialog>,
    )

    expect(screen.queryByText('Opened')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('trigger'))
    expect(screen.getByText('Opened')).toBeInTheDocument()
  })

  it('should close dialog via DialogClose', async () => {
    const user = userEvent.setup()
    render(
      <Dialog>
        <DialogTrigger data-testid="trigger">Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Content</DialogTitle>
          <DialogClose data-testid="close-btn">Close</DialogClose>
        </DialogContent>
      </Dialog>,
    )

    await user.click(screen.getByTestId('trigger'))
    expect(screen.getByText('Content')).toBeInTheDocument()

    await user.click(screen.getByTestId('close-btn'))
    expect(screen.queryByText('Content')).not.toBeInTheDocument()
  })

  it('should render header and footer together', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Header Title</DialogTitle>
            <DialogDescription>Header description</DialogDescription>
          </DialogHeader>
          <div>Body</div>
          <DialogFooter>
            <button>Action</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    )

    expect(screen.getByText('Header Title')).toBeInTheDocument()
    expect(screen.getByText('Header description')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
    expect(screen.getByText('Action')).toBeInTheDocument()
  })
})
