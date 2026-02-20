import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('/+page.svelte', () => {
  it('should render workspaces heading', async () => {
    render(Page, { data: { workspaces: [] } });

    const heading = page.getByRole('heading', { level: 3 });
    await expect.element(heading).toHaveTextContent('Workspaces');
  });

  it('should show empty state when no workspaces', async () => {
    render(Page, { data: { workspaces: [] } });

    const msg = page.getByText('No workspaces yet');
    await expect.element(msg).toBeInTheDocument();
  });

  it('should render workspace cards', async () => {
    render(Page, {
      data: {
        workspaces: [
          { name: 'fix-bug', branch: 'servitor/fix-bug' },
          { name: 'add-feature', branch: 'servitor/add-feature' }
        ]
      }
    });

    const fixBug = page.getByText('fix-bug', { exact: true });
    await expect.element(fixBug).toBeInTheDocument();

    const addFeature = page.getByText('add-feature', { exact: true });
    await expect.element(addFeature).toBeInTheDocument();
  });
});
