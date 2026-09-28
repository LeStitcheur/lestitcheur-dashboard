import {githubCredential,githubClient} from './github-release.js';
export function createGithub({cwd,credential=githubCredential,client=githubClient}) {
  const connect=async()=>client(await credential(cwd));
  const valid=value=>{if(typeof value!=='string'||!/^[\w.-]+$/.test(value)||value==='.'||value==='..')throw Error('Dépôt GitHub invalide.');return value;};
  return {
    async list(page=1){
      page=Number(page);if(!Number.isInteger(page)||page<1||page>1000)throw Error('Page invalide.');
      const api=await connect();const [user,repos]=await Promise.all([api.api('/user'),api.api(`/user/repos?sort=updated&direction=desc&per_page=30&page=${page}`)]);
      return {user:{login:user.login,name:user.name,avatarUrl:user.avatar_url},page,hasMore:repos.length===30,repos:repos.map(r=>({id:r.id,name:r.name,fullName:r.full_name,description:r.description,private:r.private,archived:r.archived,language:r.language,branch:r.default_branch,stars:r.stargazers_count,updatedAt:r.pushed_at}))};
    },
    async details(owner,repo){
      const base=`/repos/${valid(owner)}/${valid(repo)}`,api=await connect();
      const routes={issues:'/issues?state=open&per_page=20',pulls:'/pulls?state=open&per_page=20',runs:'/actions/runs?per_page=10',releases:'/releases?per_page=10'};
      const results=await Promise.allSettled(Object.values(routes).map(route=>api.api(base+route))),data={errors:{}};
      Object.keys(routes).forEach((key,i)=>{const result=results[i];if(result.status==='rejected'){data.errors[key]=result.reason.message;data[key]=[];return;}const list=key==='runs'?result.value.workflow_runs:result.value;
        data[key]=(list||[]).filter(item=>key!=='issues'||!item.pull_request).map(item=>({id:item.id,number:item.number,title:item.title||item.display_title||item.name||item.tag_name,state:item.conclusion||item.status||item.state||(item.draft?'Brouillon':item.prerelease?'Préversion':'Publiée'),url:item.html_url,updatedAt:item.updated_at||item.created_at}));});return data;
    }
  };
}
