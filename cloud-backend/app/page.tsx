import {requireChatGPTUser} from './chatgpt-auth';
import Operations from './operations';
export const dynamic='force-dynamic';
export default async function Home(){
 await requireChatGPTUser('/');
 return <Operations />;
}
