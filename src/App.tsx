import { useRoute } from './router';
import { Control } from './screens/Control/Control';
import { Index } from './screens/Index';
import { Join } from './screens/Join/Join';
import { Kit } from './screens/Kit/Kit';
import { NewGame } from './screens/NewGame/NewGame';
import { Play } from './screens/Play/Play';
import { Results } from './screens/Results/Results';
import { Screen } from './screens/Screen/Screen';
import { Wire } from './screens/Wire/Wire';

export function App() {
  const { segments } = useRoute();
  switch (segments[0]) {
    case undefined:
      return <Index />;
    case 'screen':
      return <Screen />;
    case 'j':
      return <Join />;
    case 'play':
      return <Play />;
    case 'control':
      return <Control />;
    case 'new':
      return <NewGame />;
    case 'results':
      return <Results />;
    case 'kit':
      return <Kit />;
    case 'wire':
      return <Wire />;
    default:
      return (
        <div className="page stack">
          <p className="notice err" role="alert">No view at this address. Open the index and select a view.</p>
          <a href="#/">INDEX</a>
        </div>
      );
  }
}
