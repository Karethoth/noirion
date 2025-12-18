import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing/react';
import { GET_EVENTS, CREATE_EVENT, DELETE_EVENT, UPDATE_EVENT } from '../graphql/events';
import { GET_PRESENCES } from '../graphql/presences';

// Mock leaflet + react-leaflet so jsdom doesn't need map internals
vi.mock('leaflet', () => {
  const L = {
    Icon: {
      Default: function DefaultIcon() {},
    },
    divIcon: vi.fn(() => ({}))
  };
  L.Icon.Default.prototype = { _getIconUrl: () => null };
  L.Icon.Default.mergeOptions = vi.fn();
  return { default: L };
});

vi.mock('react-leaflet', () => {
  const MapContainer = ({ children }) => <div data-testid="map">{children}</div>;
  const TileLayer = () => <div data-testid="tile" />;
  const Marker = () => <div data-testid="marker" />;
  const useMapEvents = () => ({ });
  const useMap = () => ({
    getContainer: () => ({
      classList: {
        add: () => {},
        remove: () => {},
      }
    })
  });
  return { MapContainer, TileLayer, Marker, useMapEvents, useMap };
});

async function loadTimelineModule() {
  return await import('../components/TimelineView.jsx');
}

function renderWithApollo(ui, mocks) {
  return render(
    <MockedProvider mocks={mocks} addTypename={false}>
      {ui}
    </MockedProvider>
  );
}

describe('TimelineView (Timeline)', () => {
  test('renders events list from query', async () => {
    const user = userEvent.setup();
    const { default: TimelineView } = await loadTimelineModule();

    const mocks = [
      {
        request: { query: GET_EVENTS, variables: { before: '2025-02-01T00:00:00.000Z', after: null } },
        result: {
          data: {
            events: [
              {
                id: 'e1',
                occurredAt: '2025-01-01T00:00:00.000Z',
                latitude: null,
                longitude: null,
                title: 'Alpha',
                description: 'First',
                entities: []
              }
            ]
          }
        }
      },
      {
        request: { query: GET_PRESENCES, variables: { before: '2025-02-01T00:00:00.000Z', after: null } },
        result: { data: { presences: [] } }
      }
    ];

    renderWithApollo(
      <TimelineView
        userRole="investigator"
        timeCursor="2025-02-01T00:00:00.000Z"
        onTimeCursorChange={() => {}}
        timeStart={null}
        onTimeStartChange={() => {}}
        ignoreTimeFilter={{ events: false, presences: false, images: false }}
        onIgnoreTimeFilterChange={() => {}}
      />,
      mocks
    );

    expect(await screen.findByText('Event: Alpha')).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();

    // keep linter happy for unused user
    expect(user).toBeDefined();
  });

  test('create validation: title required', async () => {
    const user = userEvent.setup();
    const { default: TimelineView } = await loadTimelineModule();

    const mocks = [
      {
        request: { query: GET_EVENTS, variables: { before: '2025-02-01T00:00:00.000Z', after: null } },
        result: { data: { events: [] } }
      },
      {
        request: { query: GET_PRESENCES, variables: { before: '2025-02-01T00:00:00.000Z', after: null } },
        result: { data: { presences: [] } }
      }
    ];

    renderWithApollo(
      <TimelineView
        userRole="investigator"
        timeCursor="2025-02-01T00:00:00.000Z"
        onTimeCursorChange={() => {}}
        timeStart={null}
        onTimeStartChange={() => {}}
        ignoreTimeFilter={{ events: false, presences: false, images: false }}
        onIgnoreTimeFilterChange={() => {}}
      />,
      mocks
    );

    // Wait for initial query to settle
    await screen.findByRole('heading', { name: 'Timeline', level: 2 });

    await user.click(screen.getByRole('button', { name: 'Create event…' }));

    // Location picker is opened via modal
    await user.click(screen.getByRole('button', { name: 'Set place…' }));
    expect(await screen.findByText('Set event location')).toBeInTheDocument();
    expect(screen.getByTestId('map')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Close'));

    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Title is required')).toBeInTheDocument();
  });

  test('creates event (location optional) and shows success notification', async () => {
    const user = userEvent.setup();
    const { default: TimelineView } = await loadTimelineModule();

    const before = '2025-02-01T00:00:00.000Z';
    const occurredAtIso = new Date('2025-01-01T10:20').toISOString();
    const mocks = [
      {
        request: { query: GET_EVENTS, variables: { before, after: null } },
        result: { data: { events: [] } }
      },
      {
        request: { query: GET_PRESENCES, variables: { before, after: null } },
        result: { data: { presences: [] } }
      },
      {
        request: {
          query: CREATE_EVENT,
          variables: {
            input: {
              occurredAt: occurredAtIso,
              latitude: null,
              longitude: null,
              title: 'New Event',
              description: null,
              entities: []
            }
          }
        },
        result: { data: { createEvent: { id: 'new1', entities: [] } } }
      },
      {
        request: { query: GET_EVENTS, variables: { before, after: null } },
        result: { data: { events: [] } }
      },
      {
        request: { query: GET_PRESENCES, variables: { before, after: null } },
        result: { data: { presences: [] } }
      }
    ];

    renderWithApollo(
      <TimelineView
        userRole="investigator"
        timeCursor={before}
        onTimeCursorChange={() => {}}
        timeStart={null}
        onTimeStartChange={() => {}}
        ignoreTimeFilter={{ events: false, presences: false, images: false }}
        onIgnoreTimeFilterChange={() => {}}
      />,
      mocks
    );

    await user.click(await screen.findByRole('button', { name: 'Create event…' }));

    // Fill create form
    await screen.findByText('Create Event');
    const occurredAtInputs = screen.getAllByLabelText('Occurred at');
    await user.clear(occurredAtInputs[0]);
    await user.type(occurredAtInputs[0], '2025-01-01T10:20');
    await user.type(screen.getByLabelText('Title'), 'New Event');

    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('Event created')).toBeInTheDocument();
  });

  test('edits an event and saves via update mutation', async () => {
    const user = userEvent.setup();
    const { default: TimelineView } = await loadTimelineModule();

    const before = '2025-02-01T00:00:00.000Z';
    const mocks = [
      {
        request: { query: GET_EVENTS, variables: { before, after: null } },
        result: {
          data: {
            events: [
              {
                id: 'e1',
                occurredAt: '2025-01-01T00:00:00.000Z',
                latitude: null,
                longitude: null,
                title: 'Alpha',
                description: null,
                entities: []
              }
            ]
          }
        }
      },
      {
        request: { query: GET_PRESENCES, variables: { before, after: null } },
        result: { data: { presences: [] } }
      },
      {
        request: {
          query: UPDATE_EVENT,
          variables: {
            id: 'e1',
            input: {
              occurredAt: '2025-01-01T00:00:00.000Z',
              latitude: null,
              longitude: null,
              title: 'Alpha Edited',
              description: null,
              entities: []
            }
          }
        },
        result: {
          data: {
            updateEvent: {
              id: 'e1',
              occurredAt: '2025-01-01T00:00:00.000Z',
              latitude: null,
              longitude: null,
              title: 'Alpha Edited',
              description: null,
              entities: []
            }
          }
        }
      },
      {
        request: { query: GET_EVENTS, variables: { before, after: null } },
        result: { data: { events: [] } }
      },
      {
        request: { query: GET_PRESENCES, variables: { before, after: null } },
        result: { data: { presences: [] } }
      }
    ];

    renderWithApollo(
      <TimelineView
        userRole="investigator"
        timeCursor={before}
        onTimeCursorChange={() => {}}
        timeStart={null}
        onTimeStartChange={() => {}}
        ignoreTimeFilter={{ events: false, presences: false, images: false }}
        onIgnoreTimeFilterChange={() => {}}
      />,
      mocks
    );

    expect(await screen.findByText('Event: Alpha')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(await screen.findByText('Edit Event')).toBeInTheDocument();

    const editFormHeading = screen.getByRole('heading', { name: 'Edit Event' });
    const editForm = editFormHeading.closest('.timeline-event-form');
    expect(editForm).toBeTruthy();

    const editTitleInput = within(editForm).getByLabelText('Title');
    await user.clear(editTitleInput);
    await user.type(editTitleInput, 'Alpha Edited');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Event updated')).toBeInTheDocument();
  });

  test('deletes an event after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    const { default: TimelineView } = await loadTimelineModule();

    const before = '2025-02-01T00:00:00.000Z';
    const mocks = [
      {
        request: { query: GET_EVENTS, variables: { before, after: null } },
        result: {
          data: {
            events: [
              {
                id: 'e1',
                occurredAt: '2025-01-01T00:00:00.000Z',
                latitude: null,
                longitude: null,
                title: 'Alpha',
                description: null,
                entities: []
              }
            ]
          }
        }
      },
      {
        request: { query: GET_PRESENCES, variables: { before, after: null } },
        result: { data: { presences: [] } }
      },
      {
        request: { query: DELETE_EVENT, variables: { id: 'e1' } },
        result: { data: { deleteEvent: true } }
      },
      {
        request: { query: GET_EVENTS, variables: { before, after: null } },
        result: { data: { events: [] } }
      },
      {
        request: { query: GET_PRESENCES, variables: { before, after: null } },
        result: { data: { presences: [] } }
      }
    ];

    renderWithApollo(
      <TimelineView
        userRole="investigator"
        timeCursor={before}
        onTimeCursorChange={() => {}}
        timeStart={null}
        onTimeStartChange={() => {}}
        ignoreTimeFilter={{ events: false, presences: false, images: false }}
        onIgnoreTimeFilterChange={() => {}}
      />,
      mocks
    );

    expect(await screen.findByText('Event: Alpha')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Event deleted')).toBeInTheDocument();

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
    });
  });
});
