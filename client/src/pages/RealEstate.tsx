// Bug 1 fix: replaced standalone layout with shared SolutionUseCasePage
// to ensure consistent UI across all solution vertical pages.
import SolutionUseCasePage from './solutions/SolutionUseCasePage';
import { verticalUseCases } from './solutions/useCaseContent';

export default function RealEstate() {
  return <SolutionUseCasePage content={verticalUseCases.realEstate} />;
}
