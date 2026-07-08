// Bug 1 fix: replaced standalone layout (with wrong export name) with shared
// SolutionUseCasePage to ensure consistent UI across all solution vertical pages.
import SolutionUseCasePage from './solutions/SolutionUseCasePage';
import { verticalUseCases } from './solutions/useCaseContent';

export default function Healthcare() {
  return <SolutionUseCasePage content={verticalUseCases.healthcare} />;
}
