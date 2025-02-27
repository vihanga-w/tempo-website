declare module 'react-jdenticon' {
    import * as React from 'react';

    interface JdenticonProps {
        size: string | number;
        value: string;
    }

    const Jdenticon: React.FC<JdenticonProps>;

    export default Jdenticon;
}