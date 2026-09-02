# Nayori — PerkOS Stacks Agentic Commerce: Frontend Components

## AgentRegistry Component

```tsx
import { useStacksConnect } from '@stacks/connect-react';
import { AgentRegistryContract } from '../constants/contract';

export function AgentRegistry() {
  const { makeContractCall } = useStacksConnect();
  
  const registerAgent = async (name: string, description: string) => {
    const { address } = AgentRegistryContract;
    const contractName = AgentRegistryContract.name;
    
    // Call register-agent function
    await makeContractCall({
      contractAddress: address,
      contractName,
      functionName: 'register-agent',
      functionArgs: [name, description],
      anchorMode: 0,
    });
  };
  
  return <div>Agent Registry</div>;
}
```

## AgenticCommerce Component

```tsx
import { useStacksConnect } from '@stacks/connect-react';
import { AgenticCommerceContract } from '../constants/contract';

export function AgenticCommerce() {
  const { makeContractCall } = useStacksConnect();
  
  const createJob = async (client: string, evaluator: string, budget: number) => {
    const { address } = AgenticCommerceContract;
    const contractName = AgenticCommerceContract.name;
    
    await makeContractCall({
      contractAddress: address,
      contractName,
      functionName: 'create-job',
      functionArgs: [client, evaluator, budget],
      anchorMode: 0,
    });
  };
  
  return <div>Agentic Commerce</div>;
}
```

## x402 Payment Component

```tsx
import { x402API } from '../utils/x402';

export async function fundJob(jobId: number, amount: number, walletAddress: string) {
  const response = await x402API.payment({
    jobId,
    recipient: walletAddress,
    amount,
    token: 'stx',
  });
  
  return response;
}
```

## Next Steps

1. Implement real contract calls
2. Connect to wallet
3. Test on testnet
4. Deploy to mainnet
