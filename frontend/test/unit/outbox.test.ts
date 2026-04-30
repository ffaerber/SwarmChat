import { InMemoryOutbox } from '../../src/lib/outbox'
import { runOutboxScenarios } from './outbox-scenarios'

runOutboxScenarios('InMemoryOutbox', async () => new InMemoryOutbox())
